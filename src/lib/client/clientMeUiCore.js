/** Подписи экрана /me (без React): склонения, «сегодня / завтра», дельта замеров. */
import { BODY_MEASURE_FIELDS } from '../bodyMeasures.js'
import { formatDateRu, addDaysToIso } from '../dateRu.js'
import { weekdayShortRu } from '../trainer/trainerScheduleCore.js'

export function pluralRu(n, one, few, many) {
  const a = Math.abs(Math.trunc(Number(n) || 0))
  const d10 = a % 10
  const d100 = a % 100
  if (d10 === 1 && d100 !== 11) return one
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few
  return many
}

export function trainingsWord(n) {
  return pluralRu(n, 'тренировка', 'тренировки', 'тренировок')
}

export function daysWord(n) {
  return pluralRu(n, 'день', 'дня', 'дней')
}

export function pointsWord(n) {
  return pluralRu(n, 'балл', 'балла', 'баллов')
}

/** «Сегодня», «Завтра» или «Пт, 10.10.2026». */
export function formatSessionDayRu(dayIso, todayIso) {
  if (dayIso === todayIso) return 'Сегодня'
  if (dayIso === addDaysToIso(todayIso, 1)) return 'Завтра'
  return `${weekdayShortRu(dayIso)}, ${formatDateRu(dayIso)}`
}

/** Подпись под абонементом. */
export function membershipStatusLineRu(m, todayIso) {
  if (m.status === 'upcoming') return `Начнётся ${formatDateRu(m.start_date)}`
  if (m.status === 'depleted') return 'Все тренировки использованы — продлите в клубе'
  if (m.end_date === todayIso) return 'Последний день абонемента'
  return `До ${formatDateRu(m.end_date)} · ещё ${m.days_left} ${daysWord(m.days_left)}`
}

/**
 * Изменение замеров: первый и последний замер, только поля из обоих.
 * @returns {{ id: string, label: string, from: number, to: number, diff: number }[]}
 */
export function measurementDeltas(measurements) {
  const list = Array.isArray(measurements) ? measurements : []
  if (list.length < 2) return []
  const first = list[0].values ?? {}
  const last = list.at(-1).values ?? {}
  const out = []
  for (const f of BODY_MEASURE_FIELDS) {
    if (first[f.id] == null || last[f.id] == null) continue
    out.push({ id: f.id, label: f.label, from: first[f.id], to: last[f.id], diff: Math.round((last[f.id] - first[f.id]) * 10) / 10 })
  }
  return out
}

export function formatSignedRu(n, unit) {
  const raw = Number(n)
  const abs = Math.round(Math.abs(raw) * 10) / 10
  if (!Number.isFinite(abs) || abs === 0) return `0 ${unit}`
  return `${raw > 0 ? '+' : '−'}${String(abs).replace('.', ',')} ${unit}`
}
