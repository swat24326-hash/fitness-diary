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

function isoDayNumber(dayIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dayIso ?? ''))
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null
}

/**
 * Виджет «вес»: «−5 кг / с 01.06.24» — знак отдельно от числа, чтобы рисовать его мельче. Год нужен — клиент может
 * ходить несколько лет; двузначный, чтобы влезть в 4 колонки на телефоне. Меньше двух замеров — null.
 * @returns {{ sign: string, value: string, unit: string, label: string, aria: string } | null}
 */
export function weightDeltaWidget(weights) {
  const list = Array.isArray(weights) ? weights : []
  if (list.length < 2) return null
  const first = list[0]
  const m = /^\d{2}(\d{2})-(\d{2})-(\d{2})/.exec(String(first.date ?? ''))
  const diff = Math.round((list.at(-1).kg - first.kg) * 10) / 10
  const value = String(Math.abs(diff)).replace('.', ',')
  const label = m ? `с ${m[3]}.${m[2]}.${m[1]}` : 'изменение'
  return {
    sign: diff < 0 ? '−' : diff > 0 ? '+' : '',
    value,
    unit: 'кг',
    label,
    aria: `${formatSignedRu(diff, 'кг')} ${label}`,
  }
}

/**
 * Виджет «последняя тренировка»: «сегодня», «вчера», «11 / дней назад».
 * @returns {{ value: string, label: string }}
 */
export function lastVisitWidget(lastIso, todayIso) {
  const last = isoDayNumber(lastIso)
  const today = isoDayNumber(todayIso)
  if (last == null || today == null) return { value: '—', label: 'последняя' }
  const days = Math.max(0, today - last)
  if (days === 0) return { value: 'сегодня', label: 'последняя' }
  if (days === 1) return { value: 'вчера', label: 'последняя' }
  return { value: String(days), label: `${daysWord(days)} назад` }
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
