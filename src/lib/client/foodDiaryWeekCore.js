/**
 * Сводка за 7 дней (как отчёт FatSecret «неделя»).
 */
import { dayIso, isIsoDate, shiftIsoDate, sumFoodDiaryDay } from './foodDiaryDayCore.js'

/**
 * Список дат from..from+6.
 * @param {string} fromIso
 */
export function foodDiaryWeekDates(fromIso) {
  const from = dayIso(fromIso)
  if (!isIsoDate(from)) return []
  return Array.from({ length: 7 }, (_, i) => shiftIsoDate(from, i))
}

/**
 * @param {string} endIso — обычно «сегодня»: неделя = end-6 … end
 */
export function foodDiaryWeekRangeEnding(endIso) {
  const end = dayIso(endIso)
  if (!isIsoDate(end)) return { ok: false, error: 'Укажите дату' }
  const from = shiftIsoDate(end, -6)
  return { ok: true, from, to: end, dates: foodDiaryWeekDates(from) }
}

/**
 * @param {object[]} entries — записи за диапазон (с entry_date)
 * @param {string[]} dates — 7 дат
 */
export function buildFoodDiaryWeekSeries(entries, dates) {
  /** @type {Map<string, object[]>} */
  const byDate = new Map()
  for (const d of dates) byDate.set(d, [])
  for (const e of entries ?? []) {
    const d = dayIso(e.entry_date)
    if (!byDate.has(d)) continue
    byDate.get(d).push(e)
  }
  const days = dates.map((d) => {
    const list = byDate.get(d) ?? []
    const totals = sumFoodDiaryDay(list)
    return { entry_date: d, totals, count: totals.count }
  })
  const all = entries.filter((e) => dates.includes(dayIso(e.entry_date)))
  const weekTotals = sumFoodDiaryDay(all)
  const daysWithFood = days.filter((d) => d.count > 0).length
  const avgKcal = daysWithFood ? Math.round(weekTotals.kcal / daysWithFood) : 0
  return { days, weekTotals, daysWithFood, avgKcal }
}
