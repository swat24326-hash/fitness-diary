/**
 * Создать запрос оценки после исчерпания абонемента + push (тихие часы — cron).
 */
import { randomUUID } from 'crypto'
import {
  CLIENT_RATING_KINDS,
  clientRatingCopy,
  clientRatingDeepLink,
  shouldAskMembershipRating,
} from '../../../src/lib/client/clientRatingCore.js'
import { loadSubscriptions } from '../inbox/inboxPushJob.js'
import { isWebPushConfigured, sendWebPushToRow } from '../webPushCore.js'
import { cleanClubName } from '../clientPortal/clientManifestCore.js'
import { clubOpsMinutesNow, isClientQuietMinute } from '../clientPortal/clientReminderCore.js'

export const CLIENT_RATING_NOTICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const NOTICE_BATCH = 100

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function isDuplicate(e) {
  return String(e?.code ?? '') === '23505' || /duplicate key|unique/i.test(String(e?.message ?? ''))
}

function isMissingTable(e) {
  return /client_ratings|does not exist|42P01/i.test(String(e?.message ?? e?.code ?? ''))
}

/**
 * @param {object} db
 * @param {{ id?: string, client_id?: string, club_id?: string, total_trainings?: number, used_trainings?: number }} membership
 * @returns {Promise<{ created: boolean, row?: object, skipped?: string }>}
 */
export async function ensureMembershipRatingAsk(db, membership) {
  if (!shouldAskMembershipRating(membership)) return { created: false, skipped: 'not_depleted' }
  const membershipId = String(membership.id ?? '').trim()
  const clientId = String(membership.client_id ?? '').trim()
  if (!membershipId || !clientId) return { created: false, skipped: 'bad_membership' }

  const existing = await rows(
    db
      .from('client_ratings')
      .select('id, client_id, club_id, kind, membership_id, score, comment, requested_at, answered_at, notified_at, dismissed_at')
      .eq('kind', CLIENT_RATING_KINDS.membership)
      .eq('membership_id', membershipId)
      .limit(1),
  )
  if (existing[0]) return { created: false, row: existing[0], skipped: 'exists' }

  const row = {
    id: randomUUID(),
    client_id: clientId,
    club_id: membership.club_id ?? null,
    kind: CLIENT_RATING_KINDS.membership,
    membership_id: membershipId,
    requested_at: new Date().toISOString(),
  }
  try {
    const inserted = await rows(db.from('client_ratings').insert(row).select('*'))
    return { created: true, row: inserted[0] ?? row }
  } catch (e) {
    if (isDuplicate(e)) {
      const again = await rows(
        db.from('client_ratings').select('*').eq('kind', 'membership').eq('membership_id', membershipId).limit(1),
      )
      return { created: false, row: again[0], skipped: 'race' }
    }
    throw e
  }
}

export function buildMembershipRatingPushPayload({ clubName, ratingId }) {
  const copy = clientRatingCopy(CLIENT_RATING_KINDS.membership)
  return {
    title: String(clubName ?? '').trim() || 'Ваш клуб',
    body: copy.pushBody,
    url: clientRatingDeepLink(ratingId),
    tag: `rating-membership-${ratingId}`,
  }
}

async function claimNotice(db, id, now) {
  const claimed = await rows(
    db
      .from('client_ratings')
      .update({ notified_at: now.toISOString() })
      .eq('id', id)
      .is('notified_at', null)
      .is('answered_at', null)
      .is('dismissed_at', null)
      .select('id'),
  )
  return claimed.length > 0
}

async function sendRatingNotice(db, rating, send) {
  const [club, subs] = await Promise.all([
    rating.club_id ? rows(db.from('clubs').select('name').eq('id', rating.club_id)) : [],
    loadSubscriptions(db, false, [{ client_id: String(rating.client_id) }]),
  ])
  if (!subs.length) return { sent: 0 }
  const payload = buildMembershipRatingPushPayload({
    clubName: cleanClubName(club[0]?.name),
    ratingId: rating.id,
  })
  const expired = []
  let sent = 0
  for (const s of subs) {
    const r = await send(s, payload)
    if (r.ok) sent += 1
    else if (r.expired) expired.push(s.id)
  }
  if (expired.length) await rows(db.from('client_push_subscriptions').delete().in('id', expired).select('id'))
  return { sent }
}

/** @returns {Promise<{ sent: number } | { skipped: string }>} */
export async function notifyClientRating(db, rating, { now = new Date(), send = sendWebPushToRow } = {}) {
  if (!rating?.id || rating.answered_at || rating.dismissed_at) return { skipped: 'done' }
  if (isClientQuietMinute(clubOpsMinutesNow(now))) return { skipped: 'quiet' }
  if (!isWebPushConfigured()) return { skipped: 'vapid_not_configured' }
  if (!(await claimNotice(db, rating.id, now))) return { skipped: 'claimed' }
  return sendRatingNotice(db, rating, send)
}

/**
 * После sync memberships: если лимит исчерпан — создать запрос и попытаться push.
 * @param {object} db
 * @param {object} membership
 */
export async function onMembershipPushedForRating(db, membership) {
  try {
    let m = membership
    const mid = String(m?.id ?? '').trim()
    if (mid && (m.total_trainings == null || m.client_id == null || m.used_trainings == null)) {
      const full = await rows(
        db
          .from('memberships')
          .select('id, client_id, club_id, total_trainings, used_trainings')
          .eq('id', mid)
          .limit(1),
      )
      if (full[0]) m = { ...full[0], ...m }
    }
    const ens = await ensureMembershipRatingAsk(db, m)
    if (!ens.row || ens.row.answered_at || ens.row.dismissed_at) return ens
    if (ens.created || !ens.row.notified_at) {
      await notifyClientRating(db, ens.row)
    }
    return ens
  } catch (e) {
    if (isMissingTable(e)) return { created: false, skipped: 'no_table' }
    throw e
  }
}

/** Фоном после push-record memberships — не блокировать ответ планшету. */
export function scheduleMembershipRatingAsk(db, membership) {
  if (!membership?.id) return
  void onMembershipPushedForRating(db, membership).catch((e) => {
    if (!isMissingTable(e)) console.warn('[client-rating]', e?.message || e)
  })
}

/** Cron: push по оценкам, созданным в тихие часы. */
export async function runClientRatingNotices({ db, now = new Date(), send = sendWebPushToRow } = {}) {
  if (isClientQuietMinute(clubOpsMinutesNow(now))) return { skipped: 'quiet' }
  if (!isWebPushConfigured()) return { skipped: 'vapid_not_configured' }
  let pending
  try {
    const since = new Date(now.getTime() - CLIENT_RATING_NOTICE_MAX_AGE_MS).toISOString()
    pending = await rows(
      db
        .from('client_ratings')
        .select('id, client_id, club_id, kind, requested_at, answered_at, dismissed_at, notified_at')
        .is('notified_at', null)
        .is('answered_at', null)
        .is('dismissed_at', null)
        .gte('requested_at', since)
        .order('requested_at', { ascending: true })
        .limit(NOTICE_BATCH),
    )
  } catch (e) {
    if (isMissingTable(e)) return { skipped: 'no_table' }
    throw e
  }
  let sent = 0
  for (const rating of pending) {
    if (!(await claimNotice(db, rating.id, now))) continue
    sent += (await sendRatingNotice(db, rating, send)).sent
  }
  return { pending: pending.length, sent }
}
