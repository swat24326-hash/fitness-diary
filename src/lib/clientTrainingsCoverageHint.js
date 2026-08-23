/**
 * Подсказка о полноте дневника для статистики посещаемости.
 */

import { daysSinceIsoDate } from './trainer/trainerClientOutreachCore.js'
import { isTrainingStatusCompleted } from './trainingPersistStatusCore.js'
import { todayLocalIso } from './dateRu.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Окно trainer-pull / journal — если earliest ≈ на этом горизонте, вероятен неполный кэш. */
const JOURNAL_WINDOW_HINT_MIN_DAYS = 85
const JOURNAL_WINDOW_HINT_MAX_DAYS = 96

/**
 * @param {{
 *   online?: boolean,
 *   ensureOk?: boolean,
 *   earliestLocalCompletedDate?: string | null,
 *   membershipStartDates?: string[],
 *   localCompletedCount?: number,
 * }} opts
 * @returns {string | null}
 */
export function resolveTrainingsCoverageHint(opts = {}) {
  if (opts.online === false) {
    return 'Офлайн: показаны только сохранённые локально тренировки.'
  }
  if (opts.ensureOk === false) {
    return 'Не удалось подгрузить полный дневник — цифры могут быть неполными.'
  }

  // Полный hydrate прошёл — доверяем дневник в IDB. Абонемент раньше первой тренировки
  // ≠ пропуск в кэше (клиент мог просто не ходить). ~90-дневная эвристика тоже не нужна.
  if (opts.ensureOk === true) {
    return null
  }

  const earliest = String(opts.earliestLocalCompletedDate ?? '').slice(0, 10)
  const starts = (opts.membershipStartDates ?? [])
    .map((d) => String(d ?? '').slice(0, 10))
    .filter((d) => ISO_DATE.test(d))

  if (ISO_DATE.test(earliest) && starts.length) {
    const minStart = starts.reduce((a, b) => (a < b ? a : b))
    if (minStart < earliest) {
      const gap = Math.abs(
        Math.round((parseIsoUtc(minStart) - parseIsoUtc(earliest)) / 86400000),
      )
      if (gap > 7) {
        return 'В кэше может не хватать ранних визитов — откройте вкладку «Тренировки» онлайн или нажмите Sync.'
      }
    }
  }

  if (ISO_DATE.test(earliest)) {
    const today = String(opts.todayIso ?? todayLocalIso()).slice(0, 10)
    const ageDays = daysSinceIsoDate(earliest, today)
    const count = Number(opts.localCompletedCount) || 0
    if (
      count > 0 &&
      ageDays != null &&
      ageDays >= JOURNAL_WINDOW_HINT_MIN_DAYS &&
      ageDays <= JOURNAL_WINDOW_HINT_MAX_DAYS
    ) {
      return 'В кэше могут быть только недавние тренировки (~90 дней) — нажмите Sync для полной истории.'
    }
  }

  return null
}

/** @param {string} iso */
function parseIsoUtc(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/**
 * @param {object[]} trainings
 * @returns {string | null}
 */
export function earliestCompletedTrainingDate(trainings) {
  let min = null
  for (const t of trainings ?? []) {
    if (!isTrainingStatusCompleted(t?.status)) continue
    const d = String(t?.date ?? '').slice(0, 10)
    if (!ISO_DATE.test(d)) continue
    if (min == null || d < min) min = d
  }
  return min
}
