import {
  SCHEDULE_VIEW_DAY,
  SCHEDULE_VIEW_DAYS3,
  SCHEDULE_VIEW_MONTH,
  SCHEDULE_VIEW_WEEK,
} from './trainerScheduleCore.js'

/** Вид ежедневника (День / 3 дня / Неделя / Месяц) запоминается на устройстве отдельно для планшета / телефона / админки. */

const KNOWN_VIEWS = new Set([SCHEDULE_VIEW_DAY, SCHEDULE_VIEW_DAYS3, SCHEDULE_VIEW_WEEK, SCHEDULE_VIEW_MONTH])

/** @param {string} scope */
export function scheduleViewStorageKey(scope) {
  return `fd.scheduleView.${scope}`
}

/** Неизвестное или битое значение — вид экрана по умолчанию. @param {string | null | undefined} raw @param {string} fallback */
export function parseStoredScheduleView(raw, fallback) {
  const v = String(raw ?? '').trim()
  return KNOWN_VIEWS.has(v) ? v : fallback
}
