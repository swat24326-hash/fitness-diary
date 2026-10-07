/** Экран /me (без React): какая карточка первая, напоминание о продлении, точки графика веса. */
import { addDaysToIso } from '../dateRu.js'
import { daysWord, trainingsWord } from './clientMeUiCore.js'

export const RENEW_REMAINING_MAX = 2
export const RENEW_DAYS_MAX = 7

/** Тренировка сегодня или завтра — она главнее абонемента. */
export function clientMeLeadCard(data) {
  const d = data?.next_session?.date
  const today = data?.as_of
  if (d && today && d <= addDaysToIso(today, 1)) return 'session'
  return 'membership'
}

/**
 * Мягкое напоминание о продлении. Уже купленный следующий абонемент (upcoming) — молчим;
 * исчерпанный — подпись статуса уже говорит «продлите», дубль не нужен.
 * @returns {string | null}
 */
export function clientRenewalHint(memberships) {
  const current = memberships?.current ?? []
  if (current.some((m) => m.status === 'upcoming')) return null
  const tail = 'продлить можно у администратора клуба'
  for (const m of current) {
    if (m.status !== 'active') continue
    if (m.remaining != null && m.remaining <= RENEW_REMAINING_MAX) {
      return `Осталось ${m.remaining} ${trainingsWord(m.remaining)} — ${tail}`
    }
    if (m.days_left <= RENEW_DAYS_MAX) {
      return m.days_left === 0
        ? `Сегодня последний день абонемента — ${tail}`
        : `Абонемент закончится через ${m.days_left} ${daysWord(m.days_left)} — ${tail}`
    }
  }
  return null
}

/**
 * Точки для SVG polyline: ось X — даты (честные промежутки), ось Y — вес. Меньше 2 точек — null.
 * @param {{ date: string, kg: number }[]} weights по возрастанию даты
 */
export function weightSparkPoints(weights, width, height, pad = 4) {
  const list = (weights ?? []).filter((w) => Number.isFinite(w?.kg) && Number.isFinite(Date.parse(w?.date)))
  if (list.length < 2) return null
  const xs = list.map((w) => Date.parse(w.date))
  const ys = list.map((w) => w.kg)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const sx = (x) => (x1 === x0 ? width / 2 : pad + ((x - x0) / (x1 - x0)) * (width - pad * 2))
  const sy = (y) => (y1 === y0 ? height / 2 : height - pad - ((y - y0) / (y1 - y0)) * (height - pad * 2))
  return list.map((w, i) => `${round1(sx(xs[i]))},${round1(sy(w.kg))}`).join(' ')
}

const round1 = (n) => Math.round(n * 10) / 10
