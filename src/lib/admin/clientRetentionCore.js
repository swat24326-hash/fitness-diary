/**
 * Удержание и жизнь клиента — чистые правила (без React / IDB).
 * Контуры не смешивать с Coach Quality и period census — см. docs/CLIENT_RETENTION.md
 */

import { isClientArchived } from '../clientArchive.js'
import { isPnkTrialTypeRow } from '../pnk/pnkTrialTrainingCore.js'
import { daysSinceIsoDate, isTrainerClientInactiveToday } from '../trainer/trainerClientOutreachCore.js'
import { isClientExcludedFromRenewals } from './salesPlanHallRenewalsSuggestCore.js'
import { isClientInRetentionPool } from './clientRetentionPoolCore.js'

/** Окно продления = «Закончился» (trainerClientOutreachCore STALE_TRAINING_DAYS). */
export const RETENTION_RENEWAL_WINDOW_DAYS = 14

/** Успешная реактивация: completed в N дней после restore. */
export const RETENTION_REACTIVATION_SUCCESS_DAYS = 30

/** Lookback для KPI reactivation rate. */
export const RETENTION_REACTIVATION_LOOKBACK_DAYS = 90

/**
 * @param {object|null|undefined} m
 * @param {object[]|null|undefined} membershipTypes
 */
export function isPaidMembershipRow(m, membershipTypes) {
  if (!m) return false
  const tid = String(m.membership_type_id ?? '').trim()
  if (!tid) return false
  const type = (membershipTypes ?? []).find((t) => String(t.id) === tid)
  if (type && isPnkTrialTypeRow(type)) return false
  return true
}

/**
 * Первый paid ДК (не БЗ) по start_date; fallback — pnk_won_at.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memList
 * @param {object[]|null|undefined} membershipTypes
 * @returns {string|null} yyyy-mm-dd
 */
export function resolveCohortAnchorDate(client, memList, membershipTypes) {
  const paid = (memList ?? [])
    .filter((m) => isPaidMembershipRow(m, membershipTypes))
    .sort((a, b) => String(a.start_date ?? '').localeCompare(String(b.start_date ?? '')))
  if (paid.length && paid[0].start_date) {
    return String(paid[0].start_date).slice(0, 10)
  }
  const won = String(client?.pnk_won_at ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(won)) return won
  return null
}

/**
 * @param {object[]|null|undefined} trainings
 * @param {string} clientId
 * @param {string} monthFrom yyyy-mm-dd
 * @param {string} monthTo yyyy-mm-dd
 */
export function clientEngagedInRange(trainings, clientId, monthFrom, monthTo) {
  const id = String(clientId ?? '').trim()
  const from = String(monthFrom ?? '').slice(0, 10)
  const to = String(monthTo ?? '').slice(0, 10)
  if (!id || !from || !to) return false
  return (trainings ?? []).some((t) => {
    if (String(t?.client_id ?? '') !== id) return false
    if (String(t?.status ?? '') !== 'completed') return false
    const d = String(t?.date ?? '').slice(0, 10)
    return d >= from && d <= to
  })
}

/**
 * Hard churn: archived_at попадает в [periodFrom, periodTo].
 * @param {object|null|undefined} client
 * @param {string} periodFrom
 * @param {string} periodTo
 */
export function isHardChurnInPeriod(client, periodFrom, periodTo) {
  if (!client?.archived_at) return false
  const at = String(client.archived_at).slice(0, 10)
  const from = String(periodFrom ?? '').slice(0, 10)
  const to = String(periodTo ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return false
  return at >= from && at <= to
}

/**
 * Soft churn (funnel final): >60d или странный абон. Не архив, не open PNK.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memList
 * @param {string} [todayIso]
 */
export function isSoftChurnToday(client, memList, todayIso) {
  if (!client || isClientArchived(client)) return false
  if (String(client.lifecycle ?? '').trim().toLowerCase() === 'pnk') return false
  return isTrainerClientInactiveToday(client, memList ?? [], todayIso)
}

/**
 * Retention-active на дату: в R-RET, не soft churn.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memList
 * @param {string} todayIso
 * @param {{ holdingTrainerIds?: Set<string>|string[], noTabletTrainerIds?: Set<string>|string[] }} [poolOpts]
 */
export function isRetentionActiveToday(client, memList, todayIso, poolOpts = {}) {
  if (!isClientInRetentionPool(client, poolOpts)) return false
  return !isSoftChurnToday(client, memList, todayIso)
}

/**
 * Restore: archived_at было → null.
 * @param {object|null|undefined} before
 * @param {object|null|undefined} after
 */
export function isRestoreEvent(before, after) {
  return Boolean(before?.archived_at) && !after?.archived_at
}

/**
 * @param {string} restoreDateIso
 * @param {object[]|null|undefined} trainings
 * @param {string} clientId
 * @param {number} [successDays]
 */
export function isSuccessfulReactivation(restoreDateIso, trainings, clientId, successDays = RETENTION_REACTIVATION_SUCCESS_DAYS) {
  const start = String(restoreDateIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false
  const endParts = start.split('-').map(Number)
  const endMs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]) + successDays * 86400000
  const end = new Date(endMs).toISOString().slice(0, 10)
  return clientEngagedInRange(trainings, clientId, start, end)
}

/**
 * Тот же абон, что истекает (по id или start+end).
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 */
function isSameMembershipRow(a, b) {
  if (!a || !b) return false
  if (a.id && b.id && String(a.id) === String(b.id)) return true
  const aStart = String(a.start_date ?? '').slice(0, 10)
  const aEnd = String(a.end_date ?? '').slice(0, 10)
  const bStart = String(b.start_date ?? '').slice(0, 10)
  const bEnd = String(b.end_date ?? '').slice(0, 10)
  return Boolean(aStart && aEnd && aStart === bStart && aEnd === bEnd)
}

/**
 * Paid-продление после истекающего абона в окне windowDays.
 * Классика: start ≥ end. Раннее (overlap): start > start истекающего и start ≤ end+window.
 * @param {object[]|null|undefined} memList
 * @param {object[]|null|undefined} membershipTypes
 * @param {object|null|undefined} endedMembership
 * @param {number} [windowDays]
 */
export function hasRenewalAfterEnd(memList, membershipTypes, endedMembership, windowDays = RETENTION_RENEWAL_WINDOW_DAYS) {
  if (!endedMembership?.end_date) return false
  const end = String(endedMembership.end_date).slice(0, 10)
  const endedStart = String(endedMembership.start_date ?? '').slice(0, 10)
  const endParts = end.split('-').map(Number)
  const windowEndMs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]) + windowDays * 86400000
  const windowEnd = new Date(windowEndMs).toISOString().slice(0, 10)
  return (memList ?? []).some((m) => {
    if (!isPaidMembershipRow(m, membershipTypes)) return false
    if (isSameMembershipRow(m, endedMembership)) return false
    const start = String(m.start_date ?? '').slice(0, 10)
    if (!start || start > windowEnd) return false
    if (start >= end) return true
    return Boolean(endedStart && start > endedStart)
  })
}

/**
 * Paid-абон, чей end попадает в [asOf−windowDays, asOf].
 * @param {object[]|null|undefined} memList
 * @param {object[]|null|undefined} membershipTypes
 * @param {string} asOf
 * @param {number} [windowDays]
 */
export function pickPaidMembershipEndedInWindow(memList, membershipTypes, asOf, windowDays = RETENTION_RENEWAL_WINDOW_DAYS) {
  const d = String(asOf ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const parts = d.split('-').map(Number)
  const windowStartMs = Date.UTC(parts[0], parts[1] - 1, parts[2]) - windowDays * 86400000
  const windowStart = new Date(windowStartMs).toISOString().slice(0, 10)
  const paid = (memList ?? [])
    .filter((m) => isPaidMembershipRow(m, membershipTypes))
    .filter((m) => {
      const end = String(m.end_date ?? '').slice(0, 10)
      return end && end >= windowStart && end <= d
    })
    .sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))
  return paid[0] ?? null
}

/**
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memList
 * @param {object[]|null|undefined} membershipTypes
 * @param {string} asOf
 * @param {number} [windowDays]
 */
export function isRenewalEligible(client, memList, membershipTypes, asOf, windowDays = RETENTION_RENEWAL_WINDOW_DAYS) {
  if (isClientExcludedFromRenewals(client)) return false
  return pickPaidMembershipEndedInWindow(memList, membershipTypes, asOf, windowDays) != null
}

/**
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memList
 * @param {object[]|null|undefined} membershipTypes
 * @param {string} asOf
 * @param {number} [windowDays]
 */
export function isRenewed(client, memList, membershipTypes, asOf, windowDays = RETENTION_RENEWAL_WINDOW_DAYS) {
  if (isClientExcludedFromRenewals(client)) return false
  const ended = pickPaidMembershipEndedInWindow(memList, membershipTypes, asOf, windowDays)
  if (!ended) return false
  return hasRenewalAfterEnd(memList, membershipTypes, ended, windowDays)
}

/**
 * Tenure в днях: anchor → end (включительно по календарным дням).
 * @param {string} anchorDate
 * @param {string} endDate
 */
export function tenureDays(anchorDate, endDate) {
  const a = String(anchorDate ?? '').slice(0, 10)
  const e = String(endDate ?? '').slice(0, 10)
  const d = daysSinceIsoDate(a, e)
  return d == null ? null : d + 1
}

/**
 * @param {object[]|null|undefined} memberships
 * @returns {Map<string, object[]>}
 */
export function indexMembershipsByClient(memberships) {
  const map = new Map()
  for (const m of memberships ?? []) {
    const id = String(m?.client_id ?? '').trim()
    if (!id) continue
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(m)
  }
  return map
}
