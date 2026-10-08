/** /me/trainings: подписи строки тренировки и заголовок окна просмотра (без React). */
import { weekdayShortRu } from '../trainer/trainerScheduleCore.js'

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** Заголовок окна тренировки: «31 августа, пн». */
export function trainingViewTitle(dayIso) {
  const [, m, d] = String(dayIso).split('-').map(Number)
  if (!m || !d) return 'Тренировка'
  return `${d} ${MONTHS_GEN[m - 1]}, ${weekdayShortRu(dayIso).toLowerCase()}`
}

/** Основной тренер абонемента — кто провёл больше занятий (неявки не в счёт); поровну — кто вёл последним. */
export function mainTrainerName(visits) {
  const count = new Map()
  for (const v of visits ?? []) {
    if (!v.no_show && v.trainer_name) count.set(v.trainer_name, (count.get(v.trainer_name) ?? 0) + 1)
  }
  let best = null
  for (const [name, n] of count) if (best == null || n >= count.get(best)) best = name
  return best
}

/**
 * Строка: дата в квадрате («07 / окт»), в подписи № списания и вес; тренер — только если вёл не основной.
 * @param {{ id?: string, date: string, focus: string|null, kg: number|null, trainer_name: string|null, no_show: boolean }} t
 * @returns {{ num: string, month: string, title: string, meta: string, noShow: boolean, canOpen: boolean }}
 */
export function membershipTrainingRow(t, n, mainTrainer) {
  const meta = [`№${n}`]
  if (t.no_show) meta.push('занятие списано с абонемента')
  else {
    if (t.trainer_name && t.trainer_name !== mainTrainer) meta.push(`вёл ${t.trainer_name}`)
    if (t.kg != null) meta.push(`${String(t.kg).replace('.', ',')}\u00a0кг`)
  }
  return {
    num: t.date.slice(8, 10),
    month: MONTHS_SHORT[Number(t.date.slice(5, 7)) - 1] ?? '',
    title: t.no_show ? 'Неявка' : t.focus || 'Тренировка',
    meta: meta.join(' · '),
    noShow: Boolean(t.no_show),
    canOpen: Boolean(t.id) && !t.no_show,
  }
}
