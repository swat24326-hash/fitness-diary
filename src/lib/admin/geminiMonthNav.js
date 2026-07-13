export const GEMINI_MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

/** @param {number} year @param {number} month @param {number} delta */
export function shiftMonth(year, month, delta) {
  let y = Number(year) || new Date().getFullYear()
  let m = Number(month) || 1
  m += delta
  while (m < 1) {
    m += 12
    y -= 1
  }
  while (m > 12) {
    m -= 12
    y += 1
  }
  return { year: y, month: m }
}
