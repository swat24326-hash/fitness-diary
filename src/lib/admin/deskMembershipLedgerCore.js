/**
 * Учёт абонов на desk-карточке ТЗ/АЗ (без React).
 * «Действующий» — по календарю (даты), без требования остатка тренировок:
 * у закрытий ТЗ/АЗ часто total_trainings = 0.
 */

import { membershipCoversDate } from '../membershipRules.js'
import { todayLocalIso } from '../dateRu.js'

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
  // Перекрывает сегодня, но не выбран как основной «действующий»
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
