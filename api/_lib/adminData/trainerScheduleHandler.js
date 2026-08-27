import { sendJson } from '../adminSupabase.js'
import { CLIENT_BRIEF, IN_CHUNK, PAGE, TRAINER_ROLES } from './constants.js'
import {
  buildScheduleClientNameById,
  buildTrainerNameById,
  collectScheduleClientIds,
  collectScheduleLinkedTrainingIds,
  collectScheduleTrainerIds,
  resolveTrainerScheduleAdminClubId,
  validateTrainerScheduleDateRange,
} from '../../../src/lib/admin/trainerScheduleAdminCore.js'
import { normalizeTrainerScheduleEntry } from '../../../src/lib/trainer/trainerScheduleCore.js'
import {
  filterScheduleEntriesByClubId,
  filterScheduleEntriesForClubTrainers,
} from '../../../src/lib/trainer/trainerSchedulePushAuthCore.js'

const ENTRIES_CAP = 5000

/**
 * GET admin-data?action=trainer-schedule&club_id=&day_from=&day_to=&trainer_id=
 * Админ и управляющий: read-only ежедневники тренеров клуба.
 */
export async function handleTrainerScheduleGet(ctx, req, res) {
  const clubRes = resolveTrainerScheduleAdminClubId({
    isAdmin: ctx.isAdmin,
    isSupervisor: ctx.isSupervisor,
    profileClub: String(ctx.profile?.club_id ?? ctx.supervisorClubId ?? '').trim(),
    requestedClubId: req.query?.club_id,
  })
  if (!clubRes.ok) {
    sendJson(res, clubRes.status ?? 400, { error: clubRes.error })
    return
  }

  const rangeRes = validateTrainerScheduleDateRange(
    String(req.query?.day_from ?? ''),
    String(req.query?.day_to ?? ''),
  )
  if (!rangeRes.ok) {
    sendJson(res, 400, { error: rangeRes.error })
    return
  }

  const trainerFilter = String(req.query?.trainer_id ?? '').trim() || null
  const { supabaseAdmin } = ctx
  const { clubId } = clubRes
  const { dayFrom, dayTo } = rangeRes

  if (trainerFilter) {
    const { data: trainerRow, error: trainerErr } = await supabaseAdmin
      .from('users')
      .select('id, club_id, name')
      .eq('id', trainerFilter)
      .maybeSingle()
    if (trainerErr) {
      sendJson(res, 400, { error: trainerErr.message })
      return
    }
    if (!trainerRow || String(trainerRow.club_id ?? '') !== clubId) {
      sendJson(res, 400, { error: 'Тренер не найден в этом клубе' })
      return
    }
  }

  let validTrainerIds = new Set()
  if (trainerFilter) {
    validTrainerIds = new Set([trainerFilter])
  } else {
    const { data: clubTrainers, error: ctErr } = await supabaseAdmin
      .from('users')
      .select('id, role, club_id')
      .eq('club_id', clubId)
    if (ctErr) {
      sendJson(res, 400, { error: ctErr.message })
      return
    }
    validTrainerIds = new Set(
      (clubTrainers ?? [])
        .filter((u) => TRAINER_ROLES.includes(String(u?.role ?? '').trim().toLowerCase()))
        .map((u) => String(u.id ?? '').trim())
        .filter(Boolean),
    )
  }

  const rawRows = []
  let from = 0
  let truncated = false

  try {
    for (;;) {
      if (rawRows.length >= ENTRIES_CAP) {
        truncated = true
        break
      }
      const room = ENTRIES_CAP - rawRows.length
      const limit = Math.min(PAGE, room)
      let q = supabaseAdmin
        .from('trainer_schedule_entries')
        .select('*')
        .eq('club_id', clubId)
        .gte('day_date', dayFrom)
        .lte('day_date', dayTo)
        .order('day_date', { ascending: true })
        .order('start_minutes', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + limit - 1)
      if (trainerFilter) q = q.eq('trainer_id', trainerFilter)
      const { data, error } = await q
      if (error) {
        sendJson(res, 400, { error: error.message })
        return
      }
      const chunk = data ?? []
      rawRows.push(...chunk)
      if (chunk.length < limit) break
      from += limit
    }

    const entries = filterScheduleEntriesForClubTrainers(
      filterScheduleEntriesByClubId(
        rawRows.map((row) => normalizeTrainerScheduleEntry(row)).filter(Boolean),
        clubId,
      ),
      validTrainerIds,
    )

    const trainerIds = collectScheduleTrainerIds(entries)
    const clientIds = collectScheduleClientIds(entries)
    const linkedTrainingIds = collectScheduleLinkedTrainingIds(entries)

    const trainersById = {}
    for (let i = 0; i < trainerIds.length; i += IN_CHUNK) {
      const chunk = trainerIds.slice(i, i + IN_CHUNK)
      const { data: trainers, error: te } = await supabaseAdmin
        .from('users')
        .select('id, name, club_id')
        .in('id', chunk)
      if (te) {
        sendJson(res, 400, { error: te.message })
        return
      }
      for (const t of trainers ?? []) {
        if (String(t?.club_id ?? '') === clubId) trainersById[t.id] = t
      }
    }

    const clientsById = {}
    for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
      const chunk = clientIds.slice(i, i + IN_CHUNK)
      const { data: clients, error: ce } = await supabaseAdmin
        .from('clients')
        .select(CLIENT_BRIEF)
        .eq('club_id', clubId)
        .in('id', chunk)
      if (ce) {
        sendJson(res, 400, { error: ce.message })
        return
      }
      for (const c of clients ?? []) clientsById[c.id] = c
    }

    const trainingById = {}
    for (let i = 0; i < linkedTrainingIds.length; i += IN_CHUNK) {
      const chunk = linkedTrainingIds.slice(i, i + IN_CHUNK)
      const { data: trainings, error: tre } = await supabaseAdmin
        .from('trainings')
        .select('id, status, date, client_id, trainer_id')
        .eq('club_id', clubId)
        .in('id', chunk)
      if (tre) {
        sendJson(res, 400, { error: tre.message })
        return
      }
      for (const t of trainings ?? []) trainingById[t.id] = t
    }

    sendJson(res, 200, {
      entries,
      trainersById,
      clientsById,
      trainingById,
      trainerNameById: buildTrainerNameById(Object.values(trainersById)),
      clientNameById: buildScheduleClientNameById(Object.values(clientsById)),
      totalCount: entries.length,
      truncated,
      club_id: clubId,
      trainer_id: trainerFilter,
      day_from: dayFrom,
      day_to: dayTo,
      source: 'admin_api',
    })
  } catch (e) {
    console.warn('[trainer-schedule]', e)
    sendJson(res, 500, { error: e?.message ? String(e.message).slice(0, 200) : 'Ошибка расписания' })
  }
}
