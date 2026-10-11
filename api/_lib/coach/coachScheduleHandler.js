/**
 * Ежедневник телефона: GET ?view=schedule-range&from&to и POST op schedule-save | schedule-delete | schedule-copies.
 * Только свои записи и свои клиенты; на телефон — имя клиента без телефона и карты, у тренировки — только статус.
 */
import { COACH_SCHEDULE_RANGE_RU, resolveCoachScheduleRange } from '../../../src/lib/trainer/coachScheduleEditCore.js'
import { normalizeTrainerScheduleEntry } from '../../../src/lib/trainer/trainerScheduleCore.js'
import { sendJson } from '../adminSupabase.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { COACH_SCHEDULE_ROW_FIELDS, COACH_SCHEDULE_WRITE_OPS, runCoachScheduleWrite } from './coachScheduleWriteCore.js'

export { COACH_SCHEDULE_WRITE_OPS }

export async function sendCoachScheduleRange(ctx, req, res) {
  const range = resolveCoachScheduleRange(req.query?.from, req.query?.to)
  if (!range) return sendJson(res, 400, { error: COACH_SCHEDULE_RANGE_RU })
  const db = ctx.supabaseAdmin
  const uid = ctx.user.id
  const [raw, active] = await Promise.all([
    rows(
      db
        .from('trainer_schedule_entries')
        .select(COACH_SCHEDULE_ROW_FIELDS)
        .eq('trainer_id', uid)
        .gte('day_date', range.from)
        .lte('day_date', range.to),
    ),
    rows(db.from('clients').select('id, name').eq('trainer_id', uid).is('archived_at', null).order('name')),
  ])
  const entries = raw.map(normalizeTrainerScheduleEntry).filter(Boolean).map(({ synced: _s, ...e }) => e)
  const names = Object.fromEntries(active.map((c) => [String(c.id), String(c.name ?? '')]))
  const missing = [...new Set(entries.flatMap((e) => e.client_ids))].filter((id) => !(id in names))
  const archived = await loadInChunks(missing, (part) =>
    rows(db.from('clients').select('id, name').eq('trainer_id', uid).in('id', part)),
  )
  for (const c of archived) names[String(c.id)] = String(c.name ?? '')
  const trainingIds = [...new Set(entries.map((e) => e.linked_training_id).filter(Boolean))]
  const trainings = await loadInChunks(trainingIds, (part) =>
    rows(db.from('trainings').select('id, status').eq('trainer_id', uid).in('id', part)),
  )
  sendJson(res, 200, {
    entries,
    clientNameById: names,
    trainingById: Object.fromEntries(trainings.map((t) => [String(t.id), { status: String(t.status ?? '') }])),
    clients: active.map((c) => ({ id: String(c.id), name: String(c.name ?? '') })),
  })
}

export async function handleCoachScheduleWrite(ctx, res, op, body) {
  const out = await runCoachScheduleWrite(ctx, op, body)
  sendJson(res, out.status, out.body)
}
