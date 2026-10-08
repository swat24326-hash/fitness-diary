/**
 * Запросы «Входящих» (service role). Правила — в src/lib/inbox/*, здесь только чтение и запись.
 */
import {
  inboxStaffRoleValues,
  pickInboxRecipients,
  pickInboxStaffRecipients,
} from '../../../src/lib/inbox/inboxAudienceCore.js'

const IN_CHUNK = 400
const INSERT_CHUNK = 500
export const INBOX_LIST_LIMIT = 30

export async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function rowsInChunks(ids, load) {
  const out = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(...(await load(ids.slice(i, i + IN_CHUNK))))
  return out
}

/** Кандидаты рассылки и сколько из них со входом в приложение. */
export async function loadInboxAudience(db, { clubIds, halls, asOf }) {
  const clients = await rows(
    db
      .from('clients')
      .select('id, club_id, trainer_id, desk_hall, lifecycle, pnk_created_at, archived_at')
      .in('club_id', clubIds)
      .is('archived_at', null),
  )
  const ids = clients.map((c) => String(c.id))
  const [sessions, memberships, lifecycleRows] = await Promise.all([
    rowsInChunks(ids, (part) =>
      rows(db.from('client_sessions').select('client_id').is('revoked_at', null).in('client_id', part)),
    ),
    halls.length
      ? rows(
          db
            .from('memberships')
            .select('client_id, hall, start_date, end_date, total_trainings, used_trainings')
            .in('club_id', clubIds)
            .gte('end_date', asOf),
        )
      : [],
    halls.length ? rows(db.from('client_hall_lifecycle').select('client_id, hall, closed_at').in('club_id', clubIds)) : [],
  ])
  const membershipsByClient = new Map()
  for (const m of memberships) {
    const id = String(m.client_id)
    if (!membershipsByClient.has(id)) membershipsByClient.set(id, [])
    membershipsByClient.get(id).push(m)
  }
  return pickInboxRecipients({
    clients,
    membershipsByClient,
    lifecycleRows,
    liveClientIds: new Set(sessions.map((s) => String(s.client_id))),
    halls,
    asOf,
  })
}

/** Сотрудники выбранных клубов по ролям (вход у всех есть — охват = кандидаты). */
export async function loadInboxStaffAudience(db, { clubIds, roles, excludeUserId }) {
  const values = inboxStaffRoleValues(roles)
  if (!values.length) return { matched: 0, recipients: [] }
  const users = await rows(db.from('users').select('id, club_id, role, is_active').in('club_id', clubIds).in('role', values))
  return pickInboxStaffRecipients({ users, roles, excludeUserId })
}

export async function insertInboxCampaign(db, row) {
  const { data, error } = await db.from('inbox_campaigns').insert(row).select('*').single()
  if (error) throw error
  return data
}

export async function insertInboxDeliveries(db, campaignId, recipients, rewardPoints) {
  for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
    const part = recipients.slice(i, i + INSERT_CHUNK).map((r) => ({
      campaign_id: campaignId,
      ...(r.user_id ? { user_id: r.user_id } : { client_id: r.client_id }),
      club_id: r.club_id || null,
      reward_points: rewardPoints,
    }))
    const { error } = await db.from('inbox_deliveries').insert(part)
    if (error) throw error
  }
}

export async function loadInboxCampaign(db, id) {
  const { data, error } = await db.from('inbox_campaigns').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ?? null
}

/** Последние рассылки; управляющему — только где есть его клуб. */
export async function listInboxCampaigns(db, ownClubId) {
  let q = db.from('inbox_campaigns').select('*')
  if (ownClubId) q = q.contains('club_ids', [ownClubId])
  return rows(q.order('created_at', { ascending: false }).limit(INBOX_LIST_LIMIT))
}

export async function loadCampaignDeliveries(db, campaignIds, clubFilter, columns) {
  if (!campaignIds.length) return []
  let q = db.from('inbox_deliveries').select(columns).in('campaign_id', campaignIds)
  if (clubFilter) q = q.eq('club_id', clubFilter)
  return rows(q)
}

export async function loadClubNames(db, clubIds) {
  let q = db.from('clubs').select('id, name')
  if (clubIds) q = q.in('id', clubIds)
  return rows(q.order('name', { ascending: true }))
}
