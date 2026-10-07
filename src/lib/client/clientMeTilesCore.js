/**
 * Плитки /me «Мой абонемент» и «Следующая тренировка» (без React). Одна схема на обе для симметрии:
 * крупное значение + маленькая единица → подпись → подвал (у абонемента ещё полоска остатка).
 * Подсказка о продлении и следующий абонемент — заметкой под плитками, чтобы не ломать квадрат.
 */
import { formatDateRu } from '../dateRu.js'
import { daysWord, formatSessionDayRu, trainingsWord } from './clientMeUiCore.js'
import { clientRenewalHint, membershipBarPercent } from './clientMeHighlightsCore.js'

/**
 * @returns {{ hero: string, unit: string, caption: string, foot: string, bar: number|null, tone: 'ok'|'warn'|'muted' }}
 */
export function membershipTile(memberships, todayIso) {
  const current = memberships?.current ?? []
  const m = current.find((x) => x.status !== 'upcoming') ?? current[0]
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
  const foot = m.status === 'upcoming' ? `Начнётся ${formatDateRu(m.start_date)}` : m.end_date === todayIso ? 'Последний день' : `До ${formatDateRu(m.end_date)}`
  if (m.status === 'depleted') {
    return { hero: '0', unit: limited ? `из ${m.total}` : '', caption: 'все тренировки использованы', foot: 'Продлить можно в клубе', bar: 0, tone: 'warn' }
  }
  if (!limited) {
    const days = m.status === 'upcoming' ? null : m.days_left
    return {
      hero: days == null ? '∞' : String(days),
      unit: days == null ? '' : daysWord(days),
      caption: days == null ? 'безлимит' : 'до конца безлимита',
      foot,
      bar: null,
      tone: m.status === 'upcoming' ? 'muted' : 'ok',
    }
  }
  return {
    hero: String(m.remaining),
    unit: `из ${m.total}`,
    caption: `${trainingsWord(m.remaining)} осталось`,
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

/** @returns {{ hero: string, unit: string, caption: string, foot: string, tone: 'ok'|'muted' }} */
export function sessionTile(session, todayIso) {
  if (!session) {
    return { hero: '—', unit: '', caption: 'не запланирована', foot: 'Договоритесь с тренером', tone: 'muted' }
  }
  return {
    hero: session.time || '—',
    unit: '',
    caption: formatSessionDayRu(session.date, todayIso).toLowerCase(),
    foot: session.trainer_name ? `Тренер: ${session.trainer_name}` : 'Тренер уточнится',
    tone: 'ok',
  }
}
