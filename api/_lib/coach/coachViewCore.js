/**
 * Что уходит на телефон тренера — белые списки полей. На личном устройстве нет телефонов клиентов,
 * заметок, денег и тренировок: только имя, время и подпись слота.
 */
import { addDaysToIso } from '../../../src/lib/dateRu.js'
import {
  buildScheduleEntryLabel,
  formatScheduleTimeRange,
  normalizeTrainerScheduleEntry,
} from '../../../src/lib/trainer/trainerScheduleCore.js'

export const COACH_SCHEDULE_FIELDS = 'id, club_id, trainer_id, day_date, start_minutes, duration_minutes, title, client_ids, linked_training_id'

/** Сегодня и завтра по времени клуба. */
export function coachScheduleDays(todayIso) {
  return [todayIso, addDaysToIso(todayIso, 1)]
}

/**
 * @param {object[]} rawEntries строки trainer_schedule_entries
 * @param {Record<string, string>} clientNameById
 * @param {string} todayIso
 */
export function buildCoachSchedule(rawEntries, clientNameById, todayIso) {
  const entries = (rawEntries ?? []).map(normalizeTrainerScheduleEntry).filter(Boolean)
  return coachScheduleDays(todayIso).map((date, i) => ({
    date,
    label: i === 0 ? 'Сегодня' : 'Завтра',
    items: entries
      .filter((e) => e.day_date === date)
      .sort((a, b) => a.start_minutes - b.start_minutes)
      .map((e) => ({
        id: e.id,
        time: formatScheduleTimeRange(e),
        start_minutes: e.start_minutes,
        title: buildScheduleEntryLabel(e, clientNameById),
        clients: e.client_ids.length,
        started: Boolean(e.linked_training_id),
      })),
  }))
}

/** Имя для шапки и «Ещё» — без логина, телефона и почты. */
export function buildCoachMe(profile) {
  return { name: String(profile?.name ?? '').trim() }
}
