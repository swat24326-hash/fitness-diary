/**
 * Запись Ежедневника с телефона: сверка с сохранённой строкой (409, перенос) и запись тем же
 * executePushRecord, что у планшета, — authorizePush проверяет клиентов, клуб и тренировку.
 * Между чтением и записью проверки не атомарны: окно — доли секунды, худший случай = последняя правка выигрывает.
 */
import { randomUUID } from 'node:crypto'
import {
  COACH_SCHEDULE_CONFLICT_RU,
  COACH_SCHEDULE_GONE_RU,
  buildCoachScheduleRow,
  coachScheduleMoveDenial,
  isCoachScheduleConflict,
  normalizeCoachScheduleCopyDays,
} from '../../../src/lib/trainer/coachScheduleEditCore.js'
import { executePushRecord } from '../pushRecordCore.js'
import { rows } from '../inbox/inboxStore.js'

const TABLE = 'trainer_schedule_entries'
export const COACH_SCHEDULE_ROW_FIELDS =
  'id, club_id, trainer_id, day_date, start_minutes, duration_minutes, title, client_ids, linked_training_id, kind, created_at, updated_at'

const reply = (status, body) => ({ status, body })

async function loadOwnEntry(ctx, id) {
  if (!id) return null
  const found = await rows(ctx.supabaseAdmin.from(TABLE).select(COACH_SCHEDULE_ROW_FIELDS).eq('id', id).eq('trainer_id', ctx.user.id))
  return found[0] ?? null
}

async function loadTrainingStatus(ctx, trainingId) {
  if (!trainingId) return null
  const found = await rows(ctx.supabaseAdmin.from('trainings').select('id, status').in('id', [trainingId]))
  return found[0]?.status ?? null
}

async function saveEntry(ctx, body, deps) {
  const input = body?.entry && typeof body.entry === 'object' ? body.entry : {}
  const id = String(input.id ?? '').trim()
  const existing = await loadOwnEntry(ctx, id)
  if (id && !existing) return reply(404, { error: COACH_SCHEDULE_GONE_RU })
  if (isCoachScheduleConflict(existing, body?.base_updated_at)) return reply(409, { error: COACH_SCHEDULE_CONFLICT_RU })

  const built = buildCoachScheduleRow({
    input,
    existing,
    trainerId: ctx.user.id,
    clubId: String(ctx.profile?.club_id ?? ''),
    newId: deps.newId(),
    nowMs: deps.nowMs,
  })
  if (!built.ok) return reply(400, { error: built.error })
  const denial = coachScheduleMoveDenial(existing, built.row, await loadTrainingStatus(ctx, existing?.linked_training_id))
  if (denial) return reply(409, { error: denial })

  const res = await deps.push(ctx, {
    table_name: TABLE,
    operation: existing ? 'update' : 'insert',
    data: built.row,
    remote_id: existing ? existing.id : null,
  })
  if (!res.ok) return reply(res.status ?? 400, { error: res.error })
  return reply(200, { entry: built.row })
}

async function deleteEntry(ctx, body, deps) {
  const existing = await loadOwnEntry(ctx, String(body?.id ?? '').trim())
  if (!existing) return reply(200, { ok: true })
  if (isCoachScheduleConflict(existing, body?.base_updated_at)) return reply(409, { error: COACH_SCHEDULE_CONFLICT_RU })
  const res = await deps.push(ctx, { table_name: TABLE, operation: 'delete', data: existing, remote_id: existing.id })
  if (!res.ok) return reply(res.status ?? 400, { error: res.error })
  return reply(200, { ok: true })
}

async function saveCopies(ctx, body, deps) {
  const base = body?.entry && typeof body.entry === 'object' ? body.entry : {}
  const days = normalizeCoachScheduleCopyDays(body?.days, String(base.day_date ?? '').slice(0, 10))
  let created = 0
  for (const day of days) {
    const built = buildCoachScheduleRow({
      input: { ...base, day_date: day },
      trainerId: ctx.user.id,
      clubId: String(ctx.profile?.club_id ?? ''),
      newId: deps.newId(),
      nowMs: deps.nowMs,
    })
    if (!built.ok) return reply(400, { error: built.error, created })
    const res = await deps.push(ctx, { table_name: TABLE, operation: 'insert', data: built.row, remote_id: null })
    if (!res.ok) return reply(res.status ?? 400, { error: res.error, created })
    created += 1
  }
  return reply(200, { created })
}

const OPS = { 'schedule-save': saveEntry, 'schedule-delete': deleteEntry, 'schedule-copies': saveCopies }

export const COACH_SCHEDULE_WRITE_OPS = Object.keys(OPS)

/**
 * @param {object} ctx контекст requireCoachUser
 * @param {string} op
 * @param {object} body
 * @param {{ push?: typeof executePushRecord, nowMs?: number, newId?: () => string }} [deps]
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function runCoachScheduleWrite(ctx, op, body, deps = {}) {
  const fn = OPS[op]
  if (!fn) return reply(400, { error: 'Неизвестное действие' })
  return fn(ctx, body, { push: deps.push ?? executePushRecord, nowMs: deps.nowMs ?? Date.now(), newId: deps.newId ?? randomUUID })
}
