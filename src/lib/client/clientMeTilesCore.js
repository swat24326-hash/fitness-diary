/**
 * Плитки /me «Мой абонемент» и «Следующая тренировка» (без React). Одна схема на обе для симметрии:
 * крупное значение + единица → подпись → bar (число|null) → подвал.
 * Полоска в UI всегда занимает слот meta; null — пустое место той же высоты.
 * Подсказка о продлении — заметкой под плитками, чтобы не ломать квадрат.
 */
import { formatDateRu } from '../dateRu.js'
import { clientNextSessionFootRu } from './clientAzNextSessionCore.js'
import {
  clientHomeOtherHallsNote,
  pickHomeMembership,
  withMembershipHallCaption,
} from './clientHomeHallCore.js'
import { daysWord, formatSessionDayRu, sessionStartTime, trainingsWord } from './clientMeUiCore.js'
import { clientRenewalHint, membershipBarPercent } from './clientMeHighlightsCore.js'

export { pickHomeMembership, clientHomeOtherHallsNote }

/**
 * @returns {{ hero: string, unit: string, caption: string, foot: string, bar: number|null, tone: 'ok'|'warn'|'muted' }}
 */
export function membershipTile(memberships, todayIso) {
  const current = memberships?.current ?? []
  const m = pickHomeMembership(current)
  if (!m) {
    const ended = memberships?.last_ended
    return {
      hero: '—',
      unit: '',
      caption: ended ? `закончился ${formatDateRu(ended.end_date)}` : 'абонемента пока нет',
      foot: 'Продлить можно в клубе',
      bar: null,
      tone: 'muted',
    }
  }
  const limited = m.total != null
  const used = Number(m.used) || 0
  const foot = m.status === 'upcoming' ? `Начнётся ${formatDateRu(m.start_date)}` : m.end_date === todayIso ? 'Последний день' : `До ${formatDateRu(m.end_date)}`
  if (m.status === 'depleted') {
    return {
      hero: limited ? String(m.total) : String(used),
      unit: limited ? `из ${m.total}` : '',
      caption: withMembershipHallCaption('все тренировки использованы', m),
      foot: 'Продлить можно в клубе',
      bar: limited ? 100 : null,
      tone: 'warn',
    }
  }
  if (!limited) {
    const days = m.status === 'upcoming' ? null : m.days_left
    return {
      hero: days == null ? '∞' : String(days),
      unit: days == null ? '' : daysWord(days),
      caption: withMembershipHallCaption(days == null ? 'безлимит' : 'до конца безлимита', m),
      foot,
      bar: null,
      tone: m.status === 'upcoming' ? 'muted' : 'ok',
    }
  }
  return {
    hero: String(used),
    unit: `из ${m.total}`,
    caption: withMembershipHallCaption(`${trainingsWord(used)} списано`, m),
    foot,
    bar: membershipBarPercent(m),
    tone: m.status === 'upcoming' ? 'muted' : 'ok',
  }
}

/** Заметка под плитками: продление или уже купленный следующий абонемент. */
export function membershipNote(memberships) {
  const hint = clientRenewalHint(memberships)
  if (hint) return hint
  const current = memberships?.current ?? []
  const next = current.find((x) => x.status === 'upcoming')
  return next && current.length > 1 ? `Следующий абонемент начнётся ${formatDateRu(next.start_date)}` : null
}

/** @returns {{ hero: string, unit: string, caption: string, foot: string, bar: null, tone: 'ok'|'muted' }} */
export function sessionTile(session, todayIso) {
  if (!session) {
    return { hero: '—', unit: '', caption: 'не запланирована', foot: clientNextSessionFootRu(null), bar: null, tone: 'muted' }
  }
  return {
    hero: sessionStartTime(session.time) || '—',
    unit: '',
    caption: formatSessionDayRu(session.date, todayIso).toLowerCase(),
    foot: clientNextSessionFootRu(session),
    bar: null,
    tone: 'ok',
  }
}
