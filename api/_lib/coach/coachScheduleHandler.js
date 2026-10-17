/**
 * Ежедневник телефона: GET ?view=schedule-range&from&to и POST op schedule-save | schedule-delete | schedule-copies.
 * Только свои записи и свои клиенты; телефоны в ответ не кладём.
 * Карта и тип абона — в clientInfoById (как на планшете), в список выбора клиентов — только id и имя.
 */
import { todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { resolveCoachScheduleRange, COACH_SCHEDULE_RANGE_RU } from '../../../src/lib/trainer/coachScheduleEditCore.js'
import { filterTrainerSchedulePickerClients } from '../../../src/lib/trainer/trainerClientsPzListCore.js'
import { buildScheduleClientInfoById } from '../../../src/lib/trainer/trainerScheduleClientInfoCore.js'
import { normalizeTrainerScheduleEntry } from '../../../src/lib/trainer/trainerScheduleCore.js'
import { sendJson } from '../adminSupabase.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { COACH_SCHEDULE_ROW_FIELDS, COACH_SCHEDULE_WRITE_OPS, runCoachScheduleWrite } from './coachScheduleWriteCore.js'

export { COACH_SCHEDULE_WRITE_OPS }

const CLIENT_COLS = 'id, name, card_number'
const MEM_COLS = 'id, client_id, membership_type_id, start_date, end_date, total_trainings, used_trainings'

/**
 * @param {object[]} clients
 * @returns {Map<string, object>}
 */
function clientsByIdMap(clients) {
  const map = new Map()
  for (const c of clients ?? []) {
    const id = String(c?.id ?? '').trim()
    if (id) map.set(id, c)
  }
  return map
}

export async function sendCoachScheduleRange(ctx, req, res) {
  const range = resolveCoachScheduleRange(req.query?.from, req.query?.to)
  if (!range) return sendJson(res, 400, { error: COACH_SCHEDULE_RANGE_RU })
  const db = ctx.supabaseAdmin
  const uid = ctx.user.id
  const clubId = String(ctx.profile?.club_id ?? '').trim()
  const [raw, notClubArchived] = await Promise.all([
    rows(
      db
        .from('trainer_schedule_entries')
        .select(COACH_SCHEDULE_ROW_FIELDS)
        .eq('trainer_id', uid)
        .gte('day_date', range.from)
        .lte('day_date', range.to),
    ),
    rows(db.from('clients').select(CLIENT_COLS).eq('trainer_id', uid).is('archived_at', null).order('name')),
  ])
  const entries = raw.map(normalizeTrainerScheduleEntry).filter(Boolean).map(({ synced: _s, ...e }) => e)
  const byId = clientsByIdMap(notClubArchived)
  const missing = [...new Set(entries.flatMap((e) => e.client_ids))].filter((id) => !byId.has(id))
  const archived = await loadInChunks(missing, (part) =>
    rows(db.from('clients').select(CLIENT_COLS).eq('trainer_id', uid).in('id', part)),
  )
  for (const c of archived) byId.set(String(c.id), c)

  const pickerLifecycle = await loadInChunks(
    notClubArchived.map((c) => String(c.id)),
    (part) =>
      rows(db.from('client_hall_lifecycle').select('client_id, hall, closed_at').in('client_id', part)),
  )
  const pickerClients = filterTrainerSchedulePickerClients(notClubArchived, pickerLifecycle)

  const clientIds = [...byId.keys()]
  /** @type {Record<string, object[]>} */
  const membershipsByClientId = {}
  let membershipTypes = []
  if (clubId && clientIds.length) {
    const mems = await loadInChunks(clientIds, (part) =>
      rows(db.from('memberships').select(MEM_COLS).eq('club_id', clubId).in('client_id', part)),
    )
    for (const m of mems) {
      const cid = String(m?.client_id ?? '').trim()
      if (!cid) continue
      if (!membershipsByClientId[cid]) membershipsByClientId[cid] = []
      membershipsByClientId[cid].push(m)
    }
    /* У типов абона есть code, колонки name нет — select name ронял весь schedule-range 500 (INC-2026-10-17-04). */
    try {
      membershipTypes = await rows(db.from('membership_types').select('id, code').eq('club_id', clubId))
    } catch (e) {
      console.warn('[coach] membership_types for schedule meta', e?.message || e)
      membershipTypes = []
    }
  }

  const clientsList = [...byId.values()]
  const names = Object.fromEntries(clientsList.map((c) => [String(c.id), String(c.name ?? '')]))
  const trainingIds = [...new Set(entries.map((e) => e.linked_training_id).filter(Boolean))]
  const trainings = await loadInChunks(trainingIds, (part) =>
    rows(db.from('trainings').select('id, status').eq('trainer_id', uid).in('id', part)),
  )
  sendJson(res, 200, {
    entries,
    clientNameById: names,
    clientInfoById: buildScheduleClientInfoById(clientsList, membershipsByClientId, membershipTypes, todayInTimeZoneIso()),
    trainingById: Object.fromEntries(trainings.map((t) => [String(t.id), { status: String(t.status ?? '') }])),
    clients: pickerClients.map((c) => ({ id: String(c.id), name: String(c.name ?? '') })),
  })
}

export async function handleCoachScheduleWrite(ctx, res, op, body) {
  const out = await runCoachScheduleWrite(ctx, op, body)
  sendJson(res, out.status, out.body)
}
