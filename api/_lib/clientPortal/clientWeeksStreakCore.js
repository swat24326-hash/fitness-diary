/**
 * «N недель подряд с тренировками» для /me: календарные недели пн–вс, в каждой хотя бы один визит.
 * Текущая неделя без визита серию не рвёт — она ещё идёт; счёт тогда с прошлой недели.
 */
import { addDaysToIso } from '../../../src/lib/dateRu.js'

function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7
  return addDaysToIso(iso, -weekday)
}

/** @param {string[]} visitDates ISO-даты визитов без неявок, не позже today */
export function weeksStreak(visitDates, today) {
  const weeks = new Set((visitDates ?? []).map(mondayOf))
  let week = mondayOf(today)
  if (!weeks.has(week)) week = addDaysToIso(week, -7)
  let n = 0
  while (weeks.has(week)) {
    n += 1
    week = addDaysToIso(week, -7)
  }
  return n
}
