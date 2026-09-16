/**
 * Дата при открытии «Новая тренировка» (/new).
 * У тренера не подставляем вчерашнюю дату из durable — иначе early-activate
 * при абоне, который уже действует сегодня (INC-2026-09-16-01).
 * Verify: scripts/verify-training-new-draft-date.mjs
 */

/**
 * @param {{
 *   isAdmin?: boolean,
 *   todayIso?: string,
 *   scheduleDayIso?: string | null,
 *   durableDateIso?: string | null,
 * }} input
 * @returns {string} YYYY-MM-DD
 */
export function resolveTrainerNewTrainingOpenDate(input = {}) {
  const today = String(input.todayIso ?? '').slice(0, 10)
  const schedule = String(input.scheduleDayIso ?? '').slice(0, 10)
  const durable = String(input.durableDateIso ?? '').slice(0, 10)
  const isAdmin = input.isAdmin === true

  if (schedule) {
    if (isAdmin) return schedule
    if (!today) return schedule
    return schedule > today ? today : schedule
  }

  if (isAdmin && durable) return durable
  return today || durable
}
