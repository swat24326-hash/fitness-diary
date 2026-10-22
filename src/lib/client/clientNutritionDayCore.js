/**
 * Дни рациона на экране клиента. Один день — без переключателя.
 * На кнопке короткая подпись (Пн / 1), для озвучки — полное имя дня.
 */

const WEEK_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const WEEK_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']

function asTitle(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function dayRows(payload) {
  return (Array.isArray(payload?.days) ? payload.days : []).filter((d) => Array.isArray(d?.meals) && d.meals.length)
}

/**
 * @param {object|null|undefined} payload снимок рациона
 * @returns {Array<{ index: number, short: string, spoken: string, totals: object, meals: object[] }>}
 */
export function clientNutritionDayTabs(payload) {
  const days = dayRows(payload)
  if (days.length < 2) return []
  const week = days.length === 7
  return days.map((day, index) => {
    const stored = String(day?.label ?? '').trim()
    const weekday = week ? WEEK_SHORT[index] : ''
    const short = stored.length > 0 && stored.length <= 3 ? stored : weekday || String(index + 1)
    const spoken = asTitle(weekday && short === weekday ? WEEK_LONG[index] : stored || `день ${index + 1}`)
    return {
      index,
      short,
      spoken,
      totals: day.totals ?? payload?.totals ?? {},
      meals: day.meals,
    }
  })
}

/**
 * @param {object|null|undefined} payload
 * @param {number} dayIndex
 */
export function clientNutritionDayView(payload, dayIndex) {
  const tabs = clientNutritionDayTabs(payload)
  if (!tabs.length) {
    return {
      index: 0,
      short: '',
      spoken: '',
      totals: payload?.totals ?? {},
      meals: Array.isArray(payload?.meals) ? payload.meals : [],
      tabs,
    }
  }
  const index = Math.max(0, Math.min(tabs.length - 1, Math.round(Number(dayIndex)) || 0))
  return { ...tabs[index], tabs }
}
