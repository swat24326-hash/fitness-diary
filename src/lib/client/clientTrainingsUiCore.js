/** /me/trainings: подписи строк списка тренировок за 30 дней (без React). */
import { addDaysToIso } from '../dateRu.js'
import { weekdayShortRu } from '../trainer/trainerScheduleCore.js'
import { pluralRu, trainingsWord } from './clientMeUiCore.js'

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function whenRu(dayIso, todayIso) {
  if (dayIso === todayIso) return 'сегодня'
  if (dayIso === addDaysToIso(todayIso, -1)) return 'вчера'
  const [, m, d] = dayIso.split('-').map(Number)
  return `${d} ${MONTHS_GEN[m - 1]}`
}

/**
 * @param {{ date: string, focus: string|null, kg: number|null, trainer_name: string|null, no_show: boolean }} t
 * @returns {{ num: string, weekday: string, title: string, meta: string, noShow: boolean }}
 */
export function recentTrainingRow(t, todayIso) {
  const meta = [whenRu(t.date, todayIso)]
  if (t.no_show) meta.push('занятие списано с абонемента')
  else {
    if (t.trainer_name) meta.push(t.trainer_name)
    if (t.kg != null) meta.push(`${String(t.kg).replace('.', ',')}\u00a0кг`)
  }
  return {
    num: t.date.slice(8, 10),
    weekday: weekdayShortRu(t.date).toLowerCase(),
    title: t.no_show ? 'Неявка' : t.focus || 'Тренировка',
    meta: meta.join(' · '),
    noShow: Boolean(t.no_show),
  }
}

/** «5 тренировок за 30 дней · 1 неявка» */
export function recentTrainingsSummary(list) {
  const visits = (list ?? []).filter((t) => !t.no_show).length
  const missed = (list ?? []).length - visits
  const head = `${visits} ${trainingsWord(visits)} за 30 дней`
  return missed ? `${head} · ${missed} ${pluralRu(missed, 'неявка', 'неявки', 'неявок')}` : head
}
