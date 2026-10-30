/**
 * /me/trainings: тренировки по абонементу (без React). Новые сверху, № — порядок списания.
 * Нет действующего абонемента — тренировки последнего закончившегося.
 * АЗ — списания у стойки без окна; ТЗ — только срок.
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
 * @returns {{ key: string, title: string, period: string, summary: string, gap: string|null, emptyHint: string|null,
 *   rows: { training: object, n: number, num: string, month: string, title: string, meta: string, noShow: boolean, canOpen: boolean }[] }[]}
 */
export function membershipTrainingsCards(memberships) {
  return trainingsMemberships(memberships).map((m) => {
    const hall = String(m.hall ?? 'pz')
    const title = String(m.label || m.hall_mark || 'Абонемент')
    const period = `${formatDateRu(m.start_date)} – ${formatDateRu(m.end_date)}`
    const periodLabel = m.status === 'ended' ? `${period}, закончился` : period
    const key = `${m.start_date}-${m.label}-${hall}`

    if (hall === 'tz') {
      return {
        key,
        title,
        period: periodLabel,
        summary: `Действует до ${formatDateRu(m.end_date)} · без списания занятий`,
        gap: null,
        emptyHint: 'В тренажёрном зале пока нет журнала визитов в приложении — только срок абонемента.',
        rows: [],
      }
    }

    const visits = m.visits ?? []
    const used = Number(m.used) || 0
    const missed = visits.filter((v) => v.no_show).length
    const deskOnly = visits.length > 0 && visits.every((v) => v.kind === 'desk')
    const head = m.total != null ? `Списано ${used} из ${m.total}` : `${used} ${sessionsWord(used)}`
    const unlisted = Math.max(0, used - visits.length)
    const main = deskOnly ? null : mainTrainerName(visits)
    const summary = [head]
    if (missed) summary.push(`${missed} ${pluralRu(missed, 'неявка', 'неявки', 'неявок')}`)
    if (main) summary.push(`тренер ${main}`)
    if (deskOnly) summary.push('у стойки')
    return {
      key,
      title,
      period: periodLabel,
      summary: summary.join(' · '),
      gap: unlisted
        ? `Ещё ${unlisted} ${sessionsWord(unlisted)} ${pluralRu(unlisted, 'списано', 'списаны', 'списано')} в клубе без записи тренировки — подробности у администратора`
        : null,
      emptyHint: null,
      rows: visits.map((v, i) => ({ ...membershipTrainingRow(v, i + 1, main), training: v, n: i + 1 })).reverse(),
    }
  })
}
