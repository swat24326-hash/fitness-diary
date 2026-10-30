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
import { clientAzInstructorPeerIds } from '../../../src/lib/chat/clientAzChatCore.js'
import { SCHEDULE_KIND_GROUP, resolveScheduleEntryKind } from '../../../src/lib/trainer/trainerScheduleKindCore.js'
import { cleanClubName, clientManifestUrl } from './clientManifestCore.js'
import { membershipVisitTrainerIds } from './clientMembershipVisitsCore.js'
import { clubOpsMinutesNow } from './clientReminderCore.js'
import { loadClientAzInstructorRows } from '../chat/chatStore.js'
import { rows as inboxRows } from '../inbox/inboxStore.js'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function loadDirectionNames(db, ids) {
  const unique = [...new Set((ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (!unique.length) return new Map()
  try {
    const types = await inboxRows(db.from('membership_types').select('id, name').in('id', unique))
    return new Map(types.map((t) => [String(t.id), String(t.name ?? '').trim()]))
  } catch {
    return new Map()
  }
}

async function loadNextSession(db, client, today) {
  const clientId = client.id
  let azLinks = []
  try {
    azLinks = await loadClientAzInstructorRows(db, clientId)
  } catch {
    azLinks = []
  }
  const instructorIds = clientAzInstructorPeerIds(azLinks)
  const azDirectionIds = [
    ...new Set(
      azLinks
        .map((r) => String(r?.direction_type_id ?? '').trim())
        .filter(Boolean),
    ),
  ]
  const clubId = String(client.club_id ?? '').trim()
  const [personalRaw, groups] = await Promise.all([
    rows(
      db
        .from('trainer_schedule_entries')
        .select('id, day_date, start_minutes, duration_minutes, trainer_id, kind, direction_type_id, client_ids')
        .contains('client_ids', [clientId])
        .eq('club_id', clubId)
        .gte('day_date', today)
        .order('day_date', { ascending: true })
        .order('start_minutes', { ascending: true })
        .limit(20),
    ),
    instructorIds.length && azDirectionIds.length
      ? rows(
          db
            .from('trainer_schedule_entries')
            .select('id, day_date, start_minutes, duration_minutes, trainer_id, kind, direction_type_id, client_ids')
            .eq('kind', 'group')
            .eq('club_id', clubId)
            .in('trainer_id', instructorIds)
            .in('direction_type_id', azDirectionIds)
            .gte('day_date', today)
            .order('day_date', { ascending: true })
            .order('start_minutes', { ascending: true })
            .limit(40),
        )
      : Promise.resolve([]),
  ])
  /* null kind = персоналка; group с client_ids отсекаем (не .neq в SQL — съест null). */
  const personal = personalRaw.filter((e) => resolveScheduleEntryKind(e) !== SCHEDULE_KIND_GROUP)
  const trainerIds = [...personal, ...groups].map((e) => String(e.trainer_id))
  const nameDirectionIds = [...azLinks, ...groups].map((r) => r.direction_type_id)
  const [names, dirNames] = await Promise.all([loadTrainerNames(db, trainerIds), loadDirectionNames(db, nameDirectionIds)])
  return pickNextClientSession(personal, today, clubOpsMinutesNow(), names, {
    groupEntries: groups,
    azLinks,
    directionNameById: dirNames,
  })
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

/** Пересчёт progress после записи веса/обмеров клиентом. */
export async function loadClientProgressSlice(db, clientId) {
  const today = clubOpsAsOfIso()
  const [memberships, trainings, weights, measurements] = await Promise.all([
    loadLoyaltyMemberships(db, clientId),
    loadLoyaltyCompletedTrainings(db, clientId, '1900-01-01'),
    rows(
      db
        .from('client_weight_entries')
        .select('id, date, weight_kg, source')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(60),
    ),
    rows(
      db
        .from('body_measurements')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(12),
    ),
  ])
  return {
    as_of: today,
    progress: buildClientProgress(trainings, weights, measurements, today, memberships),
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
        .select('id, date, weight_kg, source')
        .eq('client_id', client.id)
        .order('date', { ascending: false })
        .limit(60),
    ),
    rows(
      db
        .from('body_measurements')
        .select('*')
        .eq('client_id', client.id)
        .order('date', { ascending: false })
        .limit(12),
    ),
    loadNextSession(db, client, today),
  ])
  const visible = visibleClientMemberships(memberships, today)
  const [club, trainerNames] = await Promise.all([
    db.from('clubs').select('name').eq('id', client.club_id).maybeSingle(),
    loadTrainerNames(db, membershipVisitTrainerIds([...visible.current, visible.last_ended].filter(Boolean), trainings)),
  ])
  return {
    as_of: today,
    client: {
      name: String(client.name ?? ''),
      /** Есть персональный тренер ПЗ — без uuid (whitelist). Для вкладок, пока hall ещё не в кэше. */
      has_trainer: Boolean(String(client.trainer_id ?? '').trim()),
    },
    club: { name: cleanClubName(club.data?.name), manifest_url: clientManifestUrl(client.club_id) },
    memberships: buildClientMemberships(memberships, types, trainings, today, trainerNames),
    next_session,
    progress: buildClientProgress(trainings, weights, measurements, today, memberships),
    loyalty: await loadLoyalty(db, client, memberships, types, trainings, today),
  }
}
