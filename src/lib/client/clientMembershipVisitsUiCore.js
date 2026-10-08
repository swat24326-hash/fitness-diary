/**
 * /me/trainings: тренировки по абонементу (без React). Новые сверху, № — порядок списания.
 * Нет действующего абонемента — тренировки последнего закончившегося.
 */
import { formatDateRu } from '../dateRu.js'
import { pluralRu } from './clientMeUiCore.js'
import { mainTrainerName, membershipTrainingRow } from './clientTrainingsUiCore.js'

const sessionsWord = (n) => pluralRu(n, 'занятие', 'занятия', 'занятий')

/** Абонементы экрана: начавшиеся текущие (у ждущего старта тренировок ещё нет), иначе последний закончившийся. */
export function trainingsMemberships(memberships) {
  const started = (memberships?.current ?? []).filter((m) => m.status !== 'upcoming')
  if (started.length) return started
  return memberships?.last_ended?.visits ? [memberships.last_ended] : []
}

/**
 * @returns {{ key: string, title: string, period: string, summary: string, gap: string|null,
 *   rows: { training: object, n: number, num: string, month: string, title: string, meta: string, noShow: boolean, canOpen: boolean }[] }[]}
 */
export function membershipTrainingsCards(memberships) {
  return trainingsMemberships(memberships).map((m) => {
    const visits = m.visits ?? []
    const used = Number(m.used) || 0
    const missed = visits.filter((v) => v.no_show).length
    const head = m.total != null ? `Списано ${used} из ${m.total}` : `${used} ${sessionsWord(used)}`
    const unlisted = Math.max(0, used - visits.length)
    const period = `${formatDateRu(m.start_date)} – ${formatDateRu(m.end_date)}`
    const main = mainTrainerName(visits)
    const summary = [head]
    if (missed) summary.push(`${missed} ${pluralRu(missed, 'неявка', 'неявки', 'неявок')}`)
    if (main) summary.push(`тренер ${main}`)
    return {
      key: `${m.start_date}-${m.label}`,
      title: m.label,
      period: m.status === 'ended' ? `${period}, закончился` : period,
      summary: summary.join(' · '),
      gap: unlisted
        ? `Ещё ${unlisted} ${sessionsWord(unlisted)} ${pluralRu(unlisted, 'списано', 'списаны', 'списано')} в клубе без записи тренировки — подробности у администратора`
        : null,
      rows: visits.map((v, i) => ({ ...membershipTrainingRow(v, i + 1, main), training: v, n: i + 1 })).reverse(),
    }
  })
}
