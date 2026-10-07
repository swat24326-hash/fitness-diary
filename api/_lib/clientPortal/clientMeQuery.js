/**
 * Загрузка данных /api/client-me (service role, только строки этого клиента).
 * Лояльность — тот же buildLoyaltyAccount, но без записи якоря cycle_open: клиент только смотрит.
 */
import { CLUB_OPS_TIMEZONE } from '../../../src/lib/dateRu.js'
import { buildLoyaltyAccount } from '../../../src/lib/loyalty/loyaltyAccountCore.js'
import {
  clubOpsAsOfIso,
  isLoyaltyTableMissing,
  loadLoyaltyCompletedTrainings,
  loadLoyaltyLedger,
  loadLoyaltyMembershipTypes,
  loadLoyaltyMemberships,
  loadLoyaltySettingsRow,
} from '../adminData/loyaltyAccountQuery.js'
import {
  buildClientLoyalty,
  buildClientMemberships,
  buildClientProgress,
  pickNextClientSession,
} from './clientMeCore.js'

function clubNowMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_OPS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value)
  const m = Number(parts.find((p) => p.type === 'minute')?.value)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0
}

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function loadNextSession(db, clientId, today) {
  const entries = await rows(
    db
      .from('trainer_schedule_entries')
      .select('day_date, start_minutes, duration_minutes, trainer_id')
      .contains('client_ids', [clientId])
      .gte('day_date', today)
      .order('day_date', { ascending: true })
      .order('start_minutes', { ascending: true })
      .limit(10),
  )
  const trainerIds = [...new Set(entries.map((e) => String(e.trainer_id)))]
  const trainers = trainerIds.length ? await rows(db.from('users').select('id, name').in('id', trainerIds)) : []
  const names = new Map(trainers.map((u) => [String(u.id), String(u.name ?? '').trim()]))
  return pickNextClientSession(entries, today, clubNowMinutes(), names)
}

async function loadLoyalty(db, client, memberships, types, trainings, today) {
  try {
    const settings = await loadLoyaltySettingsRow(db, client.club_id)
    const ledger = await loadLoyaltyLedger(db, client.club_id, client.id)
    const enabledAt = String(settings.enabled_at || '1900-01-01').slice(0, 10)
    const snapshot = buildLoyaltyAccount({
      as_of: today,
      client_id: client.id,
      club_id: client.club_id,
      archived_at: client.archived_at ?? null,
      settings,
      trainings: trainings.filter((t) => String(t.date ?? '').slice(0, 10) >= enabledAt),
      memberships,
      membership_types: types,
      ledger,
    })
    return buildClientLoyalty(snapshot)
  } catch (e) {
    if (isLoyaltyTableMissing(e)) return null
    throw e
  }
}

/** @param {{ id: string, name?: string, club_id: string, archived_at?: string|null }} client */
export async function loadClientMe(db, client) {
  const today = clubOpsAsOfIso()
  const [memberships, types, trainings, weights, measurements, next_session] = await Promise.all([
    loadLoyaltyMemberships(db, client.id),
    loadLoyaltyMembershipTypes(db, client.club_id),
    loadLoyaltyCompletedTrainings(db, client.id, '1900-01-01'),
    rows(
      db
        .from('client_weight_entries')
        .select('date, weight_kg')
        .eq('client_id', client.id)
        .order('date', { ascending: false })
        .limit(60),
    ),
    rows(db.from('body_measurements').select('*').eq('client_id', client.id).order('date', { ascending: false }).limit(12)),
    loadNextSession(db, client.id, today),
  ])
  return {
    as_of: today,
    client: { name: String(client.name ?? '') },
    memberships: buildClientMemberships(memberships, types, trainings, today),
    next_session,
    progress: buildClientProgress(trainings, weights, measurements, today),
    loyalty: await loadLoyalty(db, client, memberships, types, trainings, today),
  }
}
