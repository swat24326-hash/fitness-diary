/**
 * Фильтр журнала завершённых тренировок за период (чистая логика).
 */

/**
 * @param {object[]|null|undefined} trainings
 * @param {string} dateFrom YYYY-MM-DD
 * @param {string} dateTo YYYY-MM-DD
 * @returns {object[]}
 */
export function filterCompletedTrainingsInDateRange(trainings, dateFrom, dateTo) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!from || !to || from > to) return []
  return (trainings ?? [])
    .filter((t) => {
      if (String(t?.status ?? '') !== 'completed') return false
      const d = String(t?.date ?? '').slice(0, 10)
      return Boolean(d && d >= from && d <= to)
    })
    .sort((a, b) => {
      const byDate = String(b?.date ?? '').localeCompare(String(a?.date ?? ''))
      if (byDate) return byDate
      return String(b?.id ?? '').localeCompare(String(a?.id ?? ''))
    })
}
