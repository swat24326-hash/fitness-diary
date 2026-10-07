/** Экран /me (без React): какая карточка первая, напоминание о продлении, точки графика веса. */
import { addDaysToIso, formatDateRu } from '../dateRu.js'
import { daysWord, formatSignedRu, trainingsWord } from './clientMeUiCore.js'

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
 * График веса: ось X — даты (честные промежутки), ось Y — вес. Меньше 2 точек — null.
 * Точки замеров и подписи мин/макс — чтобы резкий скачок читался как замер, а не как сбой графика.
 * @param {{ date: string, kg: number }[]} weights по возрастанию даты
 * @returns {{ dots: { x: number, y: number, kg: number, date: string }[], minKg: number, maxKg: number } | null}
 */
export function weightSparkGeometry(weights, width, height, pad = 4) {
  const list = (weights ?? []).filter((w) => Number.isFinite(w?.kg) && Number.isFinite(Date.parse(w?.date)))
  if (list.length < 2) return null
  const xs = list.map((w) => Date.parse(w.date))
  const ys = list.map((w) => w.kg)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const sx = (x) => (x1 === x0 ? width / 2 : pad + ((x - x0) / (x1 - x0)) * (width - pad * 2))
  const sy = (y) => (y1 === y0 ? height / 2 : height - pad - ((y - y0) / (y1 - y0)) * (height - pad * 2))
  return {
    dots: list.map((w, i) => ({ x: round1(sx(xs[i])), y: round1(sy(w.kg)), kg: w.kg, date: w.date })),
    minKg: y0,
    maxKg: y1,
  }
}

/**
 * Плавная кривая через точки (монотонный кубический сплайн): не «перелетает» выше максимума
 * и ниже минимума, поэтому изгиб не рисует вес, которого не было.
 * @param {{ x: number, y: number }[]} dots по возрастанию x
 */
export function weightSparkPath(dots) {
  const n = dots?.length ?? 0
  if (n < 2) return ''
  const slope = []
  for (let i = 0; i < n - 1; i += 1) {
    const dx = dots[i + 1].x - dots[i].x
    slope.push(dx ? (dots[i + 1].y - dots[i].y) / dx : 0)
  }
  const t = dots.map((_, i) => {
    if (i === 0) return slope[0]
    if (i === n - 1) return slope[n - 2]
    return slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  })
  for (let i = 0; i < n - 1; i += 1) {
    if (!slope[i]) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / slope[i]
    const b = t[i + 1] / slope[i]
    const s = a * a + b * b
    if (s > 9) {
      const k = 3 / Math.sqrt(s)
      t[i] = k * a * slope[i]
      t[i + 1] = k * b * slope[i]
    }
  }
  let d = `M${dots[0].x},${dots[0].y}`
  for (let i = 0; i < n - 1; i += 1) {
    const p = dots[i]
    const q = dots[i + 1]
    const h = (q.x - p.x) / 3
    d += ` C${round1(p.x + h)},${round1(p.y + t[i] * h)} ${round1(q.x - h)},${round1(q.y - t[i + 1] * h)} ${q.x},${q.y}`
  }
  return d
}

/** Ближайшая по X точка — под пальцем на графике. */
export function nearestDotIndex(dots, x) {
  let best = -1
  let bestDist = Infinity
  ;(dots ?? []).forEach((d, i) => {
    const dist = Math.abs(d.x - x)
    if (dist <= bestDist) {
      best = i
      bestDist = dist
    }
  })
  return best
}

/** Шапка графика: вес выбранного замера и сколько изменилось к последнему. */
export function weightSparkCaption(dots, index) {
  const d = dots?.[index]
  if (!d) return null
  const lastKg = dots.at(-1).kg
  const diff = Math.round((lastKg - d.kg) * 10) / 10
  const note =
    index === dots.length - 1
      ? 'последний замер'
      : diff === 0
        ? 'с тех пор без изменений'
        : `с тех пор ${formatSignedRu(diff, 'кг')}`
  return { kg: String(d.kg).replace('.', ','), date: formatDateRu(d.date), note }
}

/** Строка для SVG polyline. */
export function weightSparkPoints(weights, width, height, pad = 4) {
  const g = weightSparkGeometry(weights, width, height, pad)
  return g ? g.dots.map((d) => `${d.x},${d.y}`).join(' ') : null
}

/** Заполнение полоски абонемента — по остатку, как цифра «осталось N из M». */
export function membershipBarPercent(m) {
  const total = Number(m?.total)
  if (!Number.isFinite(total) || total <= 0) return null
  return Math.max(0, Math.min(100, (Number(m?.remaining) / total) * 100 || 0))
}

const round1 = (n) => Math.round(n * 10) / 10
