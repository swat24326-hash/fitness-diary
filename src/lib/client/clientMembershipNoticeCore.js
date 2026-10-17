/**
 * Оповещение клиенту «абонемент заканчивается» (окно ≤5 дней, как плитка «Истекает»).
 * Без React/БД. Текст — короткая «уведомлялка», как у подписок: факт + срок, без давления.
 */
import { MEMBERSHIP_EXPIRING_WITHIN_DAYS, membershipSignal } from '../clientListSignals.js'
import { deskMembershipSignal, pickDeskActiveMembership } from '../admin/deskMembershipLedgerCore.js'
import { pickUsableMembershipForDate } from '../membershipRules.js'
import { daysWordRu } from '../trainer/trainerClientOutreachCore.js'

/** Совпадает с CLIENT_NOTIFICATIONS_PATH — без импорта ленты (цикл). */
const NOTICE_FEED_PATH = '/me/notifications'

export const CLIENT_MEMBERSHIP_NOTICE_KINDS = Object.freeze({
  expiring: 'expiring',
  expired_recent: 'expired_recent',
  stale: 'stale',
})

/** Пока только этот сценарий шлём. */
export const CLIENT_MEMBERSHIP_NOTICE_ACTIVE_KIND = CLIENT_MEMBERSHIP_NOTICE_KINDS.expiring

/**
 * Текст push и ленты. Клуб не дублируем: в push title уже имя клуба (Ядро).
 * Пример: «Ваш абонемент заканчивается через 5 дней.»
 * Плейсхолдеры: {days_left} {days_word} (и {club_name}, если задать свой шаблон)
 */
export const MEMBERSHIP_EXPIRING_NOTICE_BODY =
  'Ваш абонемент заканчивается через {days_left} {days_word}.'

export const MEMBERSHIP_EXPIRING_NOTICE_TITLE = 'Абонемент заканчивается'

/** @deprecated имя для старых импортов verify — то же, что BODY */
export const MEMBERSHIP_EXPIRING_NOTICE_BODY_DRAFT = MEMBERSHIP_EXPIRING_NOTICE_BODY
/** @deprecated */
export const MEMBERSHIP_EXPIRING_NOTICE_TITLE_DRAFT = MEMBERSHIP_EXPIRING_NOTICE_TITLE

/** Окно отправки по часам клуба (минуты от полуночи), как у reminders — своё. */
export const MEMBERSHIP_NOTICE_WINDOW_FROM_MIN = 10 * 60
export const MEMBERSHIP_NOTICE_WINDOW_TO_MIN = 12 * 60

export function isMembershipNoticeWindow(minutes) {
  const m = Number(minutes)
  return Number.isFinite(m) && m >= MEMBERSHIP_NOTICE_WINDOW_FROM_MIN && m < MEMBERSHIP_NOTICE_WINDOW_TO_MIN
}

export function clientMembershipNoticeDeepLink() {
  return NOTICE_FEED_PATH
}

function daysLeftToEnd(endIso, todayIso) {
  const end = String(endIso ?? '').slice(0, 10)
  const today = String(todayIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  const endD = new Date(`${end}T12:00:00`)
  const d0 = new Date(`${today}T12:00:00`)
  if (!Number.isFinite(endD - d0)) return null
  return Math.ceil((endD - d0) / 86400000)
}

/**
 * Активный абон в окне «Истекает» (ПЗ/АЗ по занятиям+сроку или ТЗ по календарю).
 * @returns {{ membership: object, daysLeft: number, endDate: string } | null}
 */
export function pickExpiringMembershipForNotice(memList, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  const list = Array.isArray(memList) ? memList : []
  const pz = membershipSignal(list, today)
  if (pz.key === 'expiring') {
    const m = pickUsableMembershipForDate(list, today)
    const daysLeft = daysLeftToEnd(m?.end_date, today)
    if (m && daysLeft != null && daysLeft >= 0 && daysLeft <= MEMBERSHIP_EXPIRING_WITHIN_DAYS) {
      return { membership: m, daysLeft, endDate: String(m.end_date).slice(0, 10) }
    }
  }
  const tz = deskMembershipSignal(list, today)
  if (tz.key === 'expiring') {
    const m = pickDeskActiveMembership(list, today)
    const daysLeft = daysLeftToEnd(m?.end_date, today)
    if (m && daysLeft != null && daysLeft >= 0 && daysLeft <= MEMBERSHIP_EXPIRING_WITHIN_DAYS) {
      return { membership: m, daysLeft, endDate: String(m.end_date).slice(0, 10) }
    }
  }
  return null
}

/**
 * @param {{ clubName?: string, daysLeft?: number, bodyTemplate?: string, titleTemplate?: string }} opts
 */
export function buildMembershipExpiringNoticeCopy(opts = {}) {
  const daysLeft = Math.max(0, Number(opts.daysLeft) || 0)
  const vars = {
    club_name: String(opts.clubName ?? '').trim(),
    days_left: String(daysLeft),
    days_word: daysWordRu(daysLeft),
  }
  const fill = (tpl) =>
    String(tpl ?? '')
      .replaceAll('{club_name}', vars.club_name)
      .replaceAll('{days_left}', vars.days_left)
      .replaceAll('{days_word}', vars.days_word)
  return {
    title: fill(opts.titleTemplate ?? MEMBERSHIP_EXPIRING_NOTICE_TITLE),
    body: fill(opts.bodyTemplate ?? MEMBERSHIP_EXPIRING_NOTICE_BODY),
  }
}

/**
 * Элемент ленты /me/notifications из строки БД.
 * @param {{ id: string, kind?: string, title?: string, body?: string, created_at?: string, read_at?: string|null }} row
 */
export function publicMembershipNotice(row) {
  if (!row?.id || !row.created_at) return null
  return {
    id: String(row.id),
    kind: String(row.kind || CLIENT_MEMBERSHIP_NOTICE_ACTIVE_KIND),
    title: String(row.title || MEMBERSHIP_EXPIRING_NOTICE_TITLE),
    body: String(row.body || ''),
    deep_link: clientMembershipNoticeDeepLink(),
    created_at: String(row.created_at),
    read_at: row.read_at ? String(row.read_at) : null,
  }
}
