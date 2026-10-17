/**
 * Cron: оповещение «абонемент заканчивается» (окно ≤5 дней).
 * Вызов из scripts/client-reminders-vm.mjs (каждые 15 мин; окно 10:00–12:00 — здесь).
 * Вручную: node scripts/client-membership-notices-vm.mjs [--dry-run]
 */
import { randomUUID } from 'crypto'
import { todayInTimeZoneIso, CLUB_OPS_TIMEZONE } from '../../../src/lib/dateRu.js'
import {
  CLIENT_MEMBERSHIP_NOTICE_ACTIVE_KIND,
  buildMembershipExpiringNoticeCopy,
  isMembershipNoticeWindow,
  pickExpiringMembershipForNotice,
  publicMembershipNotice,
} from '../../../src/lib/client/clientMembershipNoticeCore.js'
import { loadInChunks, runWithConcurrency } from '../batchCore.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { isWebPushConfigured, sendWebPushToRow } from '../webPushCore.js'
import { cleanClubName } from './clientManifestCore.js'
import { clubOpsMinutesNow } from './clientReminderCore.js'
const SEND_PARALLEL = 8
const LOG_KEEP_DAYS = 120
const PUSH_URL = '/me/notifications'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function isMissingTable(e) {
  return /client_membership_notices|does not exist|42P01/i.test(String(e?.message ?? e?.code ?? ''))
}

function isDuplicate(e) {
  return String(e?.code ?? '') === '23505' || /duplicate key|unique/i.test(String(e?.message ?? ''))
}

async function loadLiveClients(db) {
  const sessions = await rows(db.from('client_sessions').select('id, client_id, revoked_at').is('revoked_at', null))
  if (!sessions.length) return []
  const clientIds = [...new Set(sessions.map((s) => String(s.client_id)))]
  const clients = await loadInChunks(clientIds, (part) =>
    rows(db.from('clients').select('id, club_id, name, archived_at').in('id', part)),
  )
  return clients.filter((c) => !c.archived_at)
}

async function loadMembershipsByClient(db, clientIds) {
  if (!clientIds.length) return new Map()
  const mems = await loadInChunks(clientIds, (part) =>
    rows(
      db
        .from('memberships')
        .select('id, client_id, club_id, start_date, end_date, total_trainings, used_trainings, hall')
        .in('client_id', part),
    ),
  )
  const by = new Map()
  for (const m of mems) {
    const cid = String(m.client_id)
    if (!by.has(cid)) by.set(cid, [])
    by.get(cid).push(m)
  }
  return by
}

function buildPushPayload({ clubName, title, body }) {
  return {
    title: String(clubName ?? '').trim() || title,
    body,
    url: PUSH_URL,
    tag: 'membership-expiring',
  }
}

/**
 * @param {{ dryRun?: boolean, now?: Date, send?: typeof sendWebPushToRow, db?: object }} [opts]
 */
export async function runClientMembershipExpiringNotices(opts = {}) {
  const dryRun = Boolean(opts.dryRun)
  const now = opts.now ?? new Date()
  const send = opts.send ?? sendWebPushToRow
  const db = opts.db ?? createServiceDataClient()
  const minutes = clubOpsMinutesNow(now)
  if (!isMembershipNoticeWindow(minutes)) return { skipped: 'outside_window', minutes }

  const today = todayInTimeZoneIso(CLUB_OPS_TIMEZONE, now)
  let clients
  try {
    clients = await loadLiveClients(db)
  } catch (e) {
    if (isMissingTable(e)) return { skipped: 'no_table' }
    throw e
  }
  if (!clients.length) return { candidates: 0, created: 0, pushed: 0 }

  const clubIds = [...new Set(clients.map((c) => String(c.club_id ?? '')).filter(Boolean))]
  const [clubs, memByClient, subs] = await Promise.all([
    clubIds.length ? rows(db.from('clubs').select('id, name').in('id', clubIds)) : [],
    loadMembershipsByClient(
      db,
      clients.map((c) => String(c.id)),
    ),
    rows(db.from('client_push_subscriptions').select('id, client_id, session_id, endpoint, p256dh, auth')),
  ])
  const clubName = new Map(clubs.map((c) => [String(c.id), cleanClubName(c.name)]))
  const subsByClient = new Map()
  for (const s of subs) {
    const cid = String(s.client_id)
    if (!subsByClient.has(cid)) subsByClient.set(cid, [])
    subsByClient.get(cid).push(s)
  }

  const candidates = []
  for (const c of clients) {
    const cid = String(c.id)
    const hit = pickExpiringMembershipForNotice(memByClient.get(cid) ?? [], today)
    if (!hit) continue
    const clubTitle = clubName.get(String(c.club_id ?? '')) || ''
    const copy = buildMembershipExpiringNoticeCopy({
      clientName: c.name,
      clubName: clubTitle,
      daysLeft: hit.daysLeft,
    })
    candidates.push({
      clientId: cid,
      clubId: c.club_id ?? null,
      endDate: hit.endDate,
      daysLeft: hit.daysLeft,
      title: copy.title,
      body: copy.body,
      clubTitle,
    })
  }

  if (dryRun) return { candidates: candidates.length, created: 0, pushed: 0, dryRun: true, sample: candidates.slice(0, 3) }

  let created = 0
  let pushed = 0
  const expiredSubIds = []

  await runWithConcurrency(candidates, SEND_PARALLEL, async (item) => {
    const row = {
      id: randomUUID(),
      client_id: item.clientId,
      club_id: item.clubId,
      kind: CLIENT_MEMBERSHIP_NOTICE_ACTIVE_KIND,
      membership_end_date: item.endDate,
      days_left: item.daysLeft,
      title: item.title,
      body: item.body,
      created_at: now.toISOString(),
    }
    let inserted
    try {
      inserted = await rows(db.from('client_membership_notices').insert(row).select('id'))
    } catch (e) {
      if (isDuplicate(e)) return
      if (isMissingTable(e)) throw e
      throw e
    }
    if (!inserted.length) return
    created += 1

    if (!isWebPushConfigured()) return
    const list = subsByClient.get(item.clientId) ?? []
    if (!list.length) {
      await rows(
        db.from('client_membership_notices').update({ notified_at: now.toISOString() }).eq('id', row.id).select('id'),
      )
      return
    }
    const payload = buildPushPayload({ clubName: item.clubTitle, title: item.title, body: item.body })
    let sent = 0
    for (const s of list) {
      const r = await send(s, payload)
      if (r.ok) sent += 1
      else if (r.expired) expiredSubIds.push(s.id)
    }
    pushed += sent
    await rows(
      db.from('client_membership_notices').update({ notified_at: now.toISOString() }).eq('id', row.id).select('id'),
    )
  })

  if (expiredSubIds.length) {
    await loadInChunks(expiredSubIds, (part) =>
      rows(db.from('client_push_subscriptions').delete().in('id', part).select('id')),
    )
  }

  const cut = new Date(now.getTime() - LOG_KEEP_DAYS * 86400000).toISOString().slice(0, 10)
  try {
    await rows(db.from('client_membership_notices').delete().lt('membership_end_date', cut).select('id'))
  } catch {
    /* ignore prune */
  }

  return { candidates: candidates.length, created, pushed }
}

export { publicMembershipNotice, isMissingTable }
