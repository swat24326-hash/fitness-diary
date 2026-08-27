import { getDb } from '../localDb.js'
import { saveTrainerScheduleEntry } from './trainerScheduleService.js'
import { normalizeTrainerScheduleEntry } from './trainerScheduleCore.js'

/** @param {string[]} ids */
export async function loadTrainingsByIds(ids) {
  const wanted = [...new Set((ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (!wanted.length) return {}
  const db = await getDb()
  /** @type {Record<string, object>} */
  const map = {}
  for (const id of wanted) {
    try {
      const row = await db.get('trainings', id)
      if (row) map[id] = row
    } catch {
      /* ignore */
    }
  }
  return map
}

/**
 * @param {string} scheduleEntryId
 * @param {string} trainingId
 */
export async function linkScheduleEntryToTraining(scheduleEntryId, trainingId) {
  const sid = String(scheduleEntryId ?? '').trim()
  const tid = String(trainingId ?? '').trim()
  if (!sid || !tid) return { ok: false, error: 'Нет id для связи' }
  const db = await getDb()
  const prev = await db.get('trainer_schedule_entries', sid)
  const row = normalizeTrainerScheduleEntry(prev)
  if (!row) return { ok: false, error: 'Запись расписания не найдена' }
  if (String(row.linked_training_id ?? '') === tid) return { ok: true, entry: row }
  return saveTrainerScheduleEntry({
    ...row,
    linked_training_id: tid,
  })
}
