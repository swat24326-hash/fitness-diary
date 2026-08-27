/**
 * Связь слота расписания ↔ тренировка (чистая логика).
 */
import { normalizeScheduleClientIds } from './trainerScheduleCore.js'

/** @param {unknown} raw */
export function parseScheduleEntryDayIso(raw) {
  const day = String(raw ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
}

/**
 * @param {object | null | undefined} entry
 * @param {{ trainingById?: Record<string, object>, workoutsBase?: string }} [ctx]
 */
export function resolveScheduleTrainingStart(entry, ctx = {}) {
  const workoutsBase = String(ctx.workoutsBase ?? '/trainer/workouts').replace(/\/$/, '')
  const clientIds = normalizeScheduleClientIds(entry?.client_ids)
  const dayDate = parseScheduleEntryDayIso(entry?.day_date)
  const scheduleEntryId = String(entry?.id ?? '').trim()
  const linkedId = String(entry?.linked_training_id ?? '').trim()
  const trainingById = ctx.trainingById ?? {}

  if (linkedId && trainingById[linkedId]) {
    const status = String(trainingById[linkedId]?.status ?? '')
    return {
      kind: 'open',
      trainingId: linkedId,
      path: `${workoutsBase}/${encodeURIComponent(linkedId)}`,
      label: status === 'completed' ? 'Открыть тренировку' : 'Продолжить черновик',
    }
  }

  if (clientIds.length === 1 && dayDate && scheduleEntryId) {
    const qs = new URLSearchParams({
      clientId: clientIds[0],
      date: dayDate,
      scheduleEntry: scheduleEntryId,
    })
    return {
      kind: 'new',
      clientId: clientIds[0],
      path: `${workoutsBase}/new?${qs.toString()}`,
      label: 'Начать тренировку',
    }
  }

  if (clientIds.length > 1 && dayDate && scheduleEntryId) {
    return {
      kind: 'pick_client',
      clientIds,
      dayDate,
      scheduleEntryId,
      workoutsBase,
      label: 'Начать тренировку',
    }
  }

  return { kind: 'none' }
}

/**
 * @param {string} scheduleEntryId
 * @param {string} trainingId
 */
export function shouldLinkScheduleEntryOnTrainingSave(scheduleEntryId, trainingId) {
  const sid = String(scheduleEntryId ?? '').trim()
  const tid = String(trainingId ?? '').trim()
  return Boolean(sid && tid)
}

/**
 * @param {object | null | undefined} entry
 * @param {object | null | undefined} training
 */
export function scheduleEntryTrainingStatusLabel(entry, training) {
  const linkedId = String(entry?.linked_training_id ?? '').trim()
  if (!linkedId || !training || String(training.id) !== linkedId) return ''
  const status = String(training.status ?? '')
  if (status === 'completed') return 'Тренировка завершена'
  if (status === 'draft') return 'Черновик тренировки'
  return ''
}

/** @param {string} clientId @param {string} dayDate @param {string} scheduleEntryId @param {string} [workoutsBase] */
export function buildScheduleWorkoutNewPath(clientId, dayDate, scheduleEntryId, workoutsBase = '/trainer/workouts') {
  const base = String(workoutsBase).replace(/\/$/, '')
  const qs = new URLSearchParams({
    clientId: String(clientId ?? '').trim(),
    date: parseScheduleEntryDayIso(dayDate),
    scheduleEntry: String(scheduleEntryId ?? '').trim(),
  })
  return `${base}/new?${qs.toString()}`
}
