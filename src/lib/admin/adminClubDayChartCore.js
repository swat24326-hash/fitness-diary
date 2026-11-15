/**
 * Серия для графика «По дням»: оси X (даты) / Y (тренировки),
 * средняя за период и флаги выходной / сегодня.
 *
 * @param {Array<{ date?: string, completed?: number, draft?: number }>|null|undefined} byDay
 * @param {{ todayIso?: string }} [opts]
 */
export function buildAdminClubDayChartSeries(byDay, opts = {}) {
  const todayIso = String(opts.todayIso ?? '').slice(0, 10)
  const rows = Array.isArray(byDay) ? byDay : []
  /** @type {string[]} */
  const labels = []
  /** @type {string[]} */
  const dates = []
  /** @type {number[]} */
  const completed = []
  /** @type {number[]} */
  const draft = []
  /** @type {Array<{ weekend: boolean, today: boolean }>} */
  const dayFlags = []

  for (const row of rows) {
    const date = String(row?.date ?? '').slice(0, 10)
    if (!date) continue
    dates.push(date)
    labels.push(formatDayAxisLabel(date))
    completed.push(Math.max(0, Number(row?.completed ?? 0) || 0))
    draft.push(Math.max(0, Number(row?.draft ?? 0) || 0))
    dayFlags.push({
      weekend: isWeekendIsoDate(date),
      today: Boolean(todayIso) && date === todayIso,
    })
  }

  const avgCompleted = averageCompleted(completed)
  const hasDraft = draft.some((n) => n > 0)
  return {
    labels,
    dates,
    completed,
    draft,
    dayFlags,
    avgCompleted,
    hasDraft,
    pointCount: labels.length,
  }
}

/** Короткая подпись оси X: ДД.ММ */
export function formatDayAxisLabel(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').slice(0, 10))
  if (!m) return String(isoDate ?? '')
  return `${m[3]}.${m[2]}`
}

/** Сб/Вс по календарной дате YYYY-MM-DD (без сдвига UTC). */
export function isWeekendIsoDate(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').slice(0, 10))
  if (!m) return false
  const dow = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()
  return dow === 0 || dow === 6
}

/** Среднее завершённых за дни серии (1 знак), null если пусто. */
export function averageCompleted(completed) {
  const list = Array.isArray(completed) ? completed : []
  if (!list.length) return null
  let sum = 0
  for (const n of list) sum += Number(n) || 0
  return Math.round((sum / list.length) * 10) / 10
}
