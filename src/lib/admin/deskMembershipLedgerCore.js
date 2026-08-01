/**
 * Учёт абонов на desk-карточке ТЗ/АЗ (без React).
 * «Действующий» — по календарю (даты), без остатка тренировок:
 * у закрытий ТЗ/АЗ часто total_trainings = 0.
 * Тип пакета — срок в месяцах (1 / 2 / 3…), не типы карт ПЗ.
 */

import { membershipCoversDate, membershipPeriodDayCount } from '../membershipRules.js'
import { addDaysToIso, addMonthsToIso, formatDateRu, todayLocalIso } from '../dateRu.js'
import { MEMBERSHIP_SIGNAL_COLORS } from '../clientListSignals.js'

/** Варианты пакета для ТЗ/АЗ (как в прайсе: месяц, два…). */
export const DESK_PACKAGE_MONTH_OPTIONS = [1, 2, 3, 6, 12]

/**
 * Конец пакета: старт + N календарных месяцев − 1 день (21.07 → 20.08).
 * @param {string} startIso
 * @param {number} months
 */
export function deskPackageEndIso(startIso, months) {
  const start = String(startIso ?? '').slice(0, 10)
  const n = Math.trunc(Number(months))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !(n > 0)) return ''
  return addDaysToIso(addMonthsToIso(start, n), -1)
}

/**
 * @param {number|null|undefined} months
 */
export function formatDeskPackageMonthsLabel(months) {
  const n = Math.trunc(Number(months) || 0)
  if (!(n > 0)) return '—'
  if (n === 1) return '1 месяц'
  if (n < 5) return `${n} месяца`
  return `${n} месяцев`
}

/**
 * Угадать пакет по датам (сначала точное совпадение с правилом клуба).
 * @param {string} startIso
 * @param {string} endIso
 * @returns {number|null}
 */
export function inferDeskPackageMonths(startIso, endIso) {
  const start = String(startIso ?? '').slice(0, 10)
  const end = String(endIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
    return null
  }
  for (let n = 1; n <= 24; n++) {
    if (deskPackageEndIso(start, n) === end) return n
  }
  for (let n = 1; n <= 24; n++) {
    if (addMonthsToIso(start, n) === end) return n
  }
  const days = membershipPeriodDayCount({ start_date: start, end_date: end })
  if (!(days > 0)) return null
  return Math.max(1, Math.round(days / 30))
}

/**
 * @param {object[]|null|undefined} memberships
 * @param {string} [todayIso]
 */
export function pickDeskActiveMembership(memberships, todayIso = todayLocalIso()) {
  const day = String(todayIso ?? '').slice(0, 10)
  const list = Array.isArray(memberships) ? memberships : []
  if (!day || !list.length) return null
  const covering = list.filter((m) => membershipCoversDate(m, day))
  if (!covering.length) return null
  return [...covering].sort((a, b) => {
    const endCmp = String(b.end_date ?? '').localeCompare(String(a.end_date ?? ''))
    if (endCmp) return endCmp
    return String(b.start_date ?? '').localeCompare(String(a.start_date ?? ''))
  })[0]
}

/**
 * Сигнал для списка Клиенты (вкладки ТЗ/АЗ): по сроку, не по лимиту тренировок.
 * @param {object[]|null|undefined} memberships
 * @param {string} [todayIso]
 */
export function deskMembershipSignal(memberships, todayIso = todayLocalIso()) {
  const today = String(todayIso ?? '').slice(0, 10)
  const active = pickDeskActiveMembership(memberships, today)
  if (active) {
    const end = String(active.end_date ?? '').slice(0, 10)
    const months = inferDeskPackageMonths(active.start_date, active.end_date)
    const pkg = formatDeskPackageMonthsLabel(months)
    const endD = new Date(`${end}T12:00:00`)
    const d0 = new Date(`${today}T12:00:00`)
    const daysLeft = Number.isFinite(endD - d0) ? Math.ceil((endD - d0) / 86400000) : null
    if (daysLeft != null && daysLeft <= 3) {
      return {
        key: 'expiring',
        label: `≤${Math.max(0, daysLeft)}д · ${pkg}`,
        factLabel: end ? `до ${formatDateRu(end)}` : pkg,
        color: MEMBERSHIP_SIGNAL_COLORS.expiring,
      }
    }
    return {
      key: 'active',
      label: pkg,
      factLabel: end ? `до ${formatDateRu(end)}` : pkg,
      color: MEMBERSHIP_SIGNAL_COLORS.active,
    }
  }

  const list = Array.isArray(memberships) ? memberships : []
  if (!list.length) {
    return {
      key: 'no_membership',
      label: 'нет абонемента',
      factLabel: 'нет абонемента',
      color: MEMBERSHIP_SIGNAL_COLORS.no_membership,
    }
  }

  const future = list
    .filter((m) => String(m?.start_date ?? '').slice(0, 10) > today)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0]
  if (future) {
    const startRu = formatDateRu(future.start_date)
    return {
      key: 'not_started',
      label: startRu ? `начнётся ${startRu}` : 'ждёт старт',
      factLabel: startRu ? `начнётся ${startRu}` : 'ждёт старт',
      color: MEMBERSHIP_SIGNAL_COLORS.not_started,
    }
  }

  const last = [...list].sort((a, b) =>
    String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')),
  )[0]
  const endRu = last?.end_date ? formatDateRu(last.end_date) : null
  return {
    key: 'expired',
    label: endRu ? `закончился ${endRu}` : 'закончился',
    factLabel: endRu ? `закончился ${endRu}` : 'закончился',
    color: MEMBERSHIP_SIGNAL_COLORS.expired,
  }
}

/**
 * @param {object} m
 * @param {string} [todayIso]
 * @param {string|null} [activeId]
 * @returns {'active'|'expired'|'future'|'other'}
 */
export function deskMembershipLedgerKind(m, todayIso = todayLocalIso(), activeId = null) {
  const day = String(todayIso ?? '').slice(0, 10)
  const id = String(m?.id ?? '')
  if (activeId && id && id === String(activeId)) return 'active'
  const start = String(m?.start_date ?? '').slice(0, 10)
  const end = String(m?.end_date ?? '').slice(0, 10)
  if (end && end < day) return 'expired'
  if (start && start > day) return 'future'
  if (membershipCoversDate(m, day)) return 'other'
  return 'other'
}

/**
 * @param {'active'|'expired'|'future'|'other'} kind
 */
export function deskMembershipLedgerKindLabel(kind) {
  if (kind === 'active') return 'действующий'
  if (kind === 'expired') return 'истёк'
  if (kind === 'future') return 'будущий'
  if (kind === 'other') return 'в периоде'
  return '—'
}

/**
 * @param {object[]|null|undefined} memberships
 */
export function sortDeskMembershipLedger(memberships) {
  return [...(memberships ?? [])].sort((a, b) => {
    const endCmp = String(b.end_date ?? '').localeCompare(String(a.end_date ?? ''))
    if (endCmp) return endCmp
    return String(b.start_date ?? '').localeCompare(String(a.start_date ?? ''))
  })
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseDeskPaidAmountInput(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/**
 * @param {unknown} amount
 */
export function formatDeskPaidAmountRu(amount) {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`
}
