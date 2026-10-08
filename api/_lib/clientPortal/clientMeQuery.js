/**
 * Загрузка данных /api/client-me (service role, только строки этого клиента).
 * Лояльность — тот же buildLoyaltyAccount, но без записи якоря cycle_open: клиент только смотрит.
 */
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
  visibleClientMemberships,
} from './clientMeCore.js'
import { cleanClubName, clientManifestUrl } from './clientManifestCore.js'
import { membershipVisitTrainerIds } from './clientMembershipVisitsCore.js'
import { clubOpsMinutesNow } from './clientReminderCore.js'

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
  const names = await loadTrainerNames(db, entries.map((e) => String(e.trainer_id)))
  return pickNextClientSession(entries, today, clubOpsMinutesNow(), names)
}

/** @returns {Promise<Map<string, string>>} только имя — без телефонов и ролей */
async function loadTrainerNames(db, ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  const trainers = unique.length ? await rows(db.from('users').select('id, name').in('id', unique)) : []
  return new Map(trainers.map((u) => [String(u.id), String(u.name ?? '').trim()]))
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
  const visible = visibleClientMemberships(memberships, today)
  const [club, trainerNames] = await Promise.all([
    db.from('clubs').select('name').eq('id', client.club_id).maybeSingle(),
    loadTrainerNames(db, membershipVisitTrainerIds([...visible.current, visible.last_ended].filter(Boolean), trainings)),
  ])
  return {
    as_of: today,
    client: { name: String(client.name ?? '') },
    club: { name: cleanClubName(club.data?.name), manifest_url: clientManifestUrl(client.club_id) },
    memberships: buildClientMemberships(memberships, types, trainings, today, trainerNames),
    next_session,
    progress: buildClientProgress(trainings, weights, measurements, today),
    loyalty: await loadLoyalty(db, client, memberships, types, trainings, today),
  }
}
