import { addMonthsToIso, CLUB_OPS_TIMEZONE, todayInTimeZoneIso } from '../dateRu.js'
import { isDateEnabled, weekFullyEnabled } from './loyaltyEnabledCore.js'
import {
  loyaltyRatesFromSettings,
  normalizeLoyaltyRatesSnapshot,
  normalizeLoyaltySettings,
} from './loyaltySettingsCore.js'
import { isLoyaltyEligibleTraining, trainingCompletedAt } from './loyaltyTrainingEligibleCore.js'
import { addDaysIso, mondayOf, sundayOf } from './loyaltyWeekCore.js'

/**
 * @typedef {'idle' | 'active'} LoyaltyAccountState
 * @typedef {'redeem' | 'burn_archive' | 'club_move' | 'program_toggle' | 'cycle_open'} LoyaltyLedgerKind
 * @typedef {'redeem' | 'burn_archive' | 'club_move' | 'program_start' | 'miss_restart'} LoyaltyOpenedBy
 *
 * @typedef {object} LoyaltyLedgerEntry
 * @property {LoyaltyLedgerKind} kind
 * @property {string} at
 * @property {number} [points]
 * @property {import('./loyaltySettingsCore.js').LoyaltyRates} [snapshot]
 * @property {{ cycle_start?: string, left?: boolean, club_moved_on?: string, from?: string, to?: string }} [payload]
 *
 * @typedef {object} LoyaltyAccountInput
 * @property {string} as_of
 * @property {string} client_id
 * @property {string} club_id
 * @property {string | null} [archived_at]
 * @property {unknown} [settings]
 * @property {object[]} [trainings]
 * @property {object[]} [memberships]
 * @property {object[]} [membership_types]
 * @property {object[]} [types]
 * @property {LoyaltyLedgerEntry[]} [ledger]
 *
 * @typedef {object} LoyaltyAccountSnapshot
 * @property {boolean} enabled
 * @property {LoyaltyAccountState} state
 * @property {number} points
 * @property {number} kcal_remainder
 * @property {number} weeks_credited
 * @property {string | null} cycle_start
 * @property {string | null} unlock_on
 * @property {boolean} can_redeem
 * @property {boolean} missed_open_week
 * @property {string} as_of
 *
 * @typedef {object} LoyaltyOpenCycle
 * @property {LoyaltyOpenedBy} openedBy
 * @property {string} cycle_start
 * @property {string | null} [cursorAt]
 * @property {string} as_of
 */

const HARD_KIND = new Set(['redeem', 'burn_archive', 'club_move'])

function kindRank(kind) {
  if (kind === 'burn_archive' || kind === 'club_move') return 1
  return 0
}

function parseAt(iso) {
  const n = Date.parse(String(iso ?? ''))
  return Number.isFinite(n) ? n : null
}

function laterThan(isoA, isoB) {
  const a = parseAt(isoA)
  const b = parseAt(isoB)
  if (a == null || b == null) return false
  return a > b
}

function calendarDateFromAt(at) {
  const ms = parseAt(at)
  if (ms == null) return ''
  return todayInTimeZoneIso(CLUB_OPS_TIMEZONE, new Date(ms))
}

function trainingDate(t) {
  return String(t?.date ?? '').slice(0, 10)
}

function kcalOf(t) {
  const n = Number(t?.data?.loyalty?.kcal)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

function idleSnapshot(asOf, enabled) {
  /** @type {LoyaltyAccountSnapshot} */
  return {
    enabled: enabled === true,
    state: 'idle',
    points: 0,
    kcal_remainder: 0,
    weeks_credited: 0,
    cycle_start: null,
    unlock_on: null,
    can_redeem: false,
    missed_open_week: false,
    as_of: asOf,
  }
}

function lastInboundClubMove(ledger) {
  const rows = (ledger ?? []).filter((e) => e?.kind === 'club_move' && e?.payload?.left !== true)
  if (!rows.length) return null
  return [...rows].sort((a, b) => (parseAt(a.at) ?? 0) - (parseAt(b.at) ?? 0)).at(-1)
}

function lastHardOrigin(ledger) {
  const rows = (ledger ?? []).filter((e) => HARD_KIND.has(String(e?.kind ?? '')))
  if (!rows.length) return null
  const sorted = [...rows].sort((a, b) => {
    const ta = parseAt(a.at) ?? 0
    const tb = parseAt(b.at) ?? 0
    if (ta !== tb) return ta - tb
    return kindRank(a.kind) - kindRank(b.kind)
  })
  return sorted.at(-1)
}

function snapshotForCycleOpen(ledger, cycleStart, fallbackRates) {
  const hit = (ledger ?? []).find(
    (e) => e?.kind === 'cycle_open' && String(e?.payload?.cycle_start ?? '') === cycleStart,
  )
  return normalizeLoyaltyRatesSnapshot(hit?.snapshot, fallbackRates)
}

function earliestMissedWeekMonday(cycleStart, inCycle, intervals, asOf) {
  let mon = mondayOf(cycleStart)
  if (!mon) return null
  while (sundayOf(mon) < asOf) {
    const hasVisit = inCycle.some((t) => mondayOf(trainingDate(t)) === mon)
    if (!hasVisit && weekFullyEnabled(mon, intervals)) return mon
    mon = addDaysIso(mon, 7)
    if (!mon) return null
  }
  return null
}

function afterCutoff(t, cutoffDate, cutoffAt) {
  const date = trainingDate(t)
  if (date > cutoffDate) return true
  if (!cutoffAt) return date >= cutoffDate
  if (date < cutoffDate) return false
  const done = trainingCompletedAt(t)
  return Boolean(done && laterThan(done, cutoffAt))
}

/**
 * Тренировка в открытом цикле (для verify).
 * @param {object} t
 * @param {LoyaltyOpenCycle} cycle
 * @returns {boolean}
 */
export function trainingInOpenCycle(t, cycle) {
  const date = trainingDate(t)
  const asOf = cycle?.as_of
  if (!date || date > asOf || date < cycle.cycle_start) return false
  if (cycle.openedBy === 'redeem') {
    if (date > cycle.cycle_start) return true
    const done = trainingCompletedAt(t)
    return Boolean(done && cycle.cursorAt && laterThan(done, cycle.cursorAt))
  }
  return date >= cycle.cycle_start
}

function compareTrainings(a, b) {
  const da = trainingDate(a).localeCompare(trainingDate(b))
  if (da) return da
  const ca = trainingCompletedAt(a) ?? ''
  const cb = trainingCompletedAt(b) ?? ''
  const c = String(ca).localeCompare(String(cb))
  if (c) return c
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
}

function activeSnapshot({ asOf, enabled, inCycle, snapshot, cycleStart, intervals }) {
  const mondays = new Set()
  let kcalSum = 0
  for (const t of inCycle) {
    mondays.add(mondayOf(trainingDate(t)))
    kcalSum += kcalOf(t)
  }
  mondays.delete('')
  const weeks_credited = mondays.size
  const chunk = snapshot.kcal_chunk
  const kcal_points = Math.floor(kcalSum / chunk) * snapshot.points_per_kcal_chunk
  const kcal_remainder = kcalSum % chunk
  const points = weeks_credited * snapshot.points_per_week + kcal_points
  const unlock_on = addMonthsToIso(cycleStart, snapshot.cycle_months)
  const can_redeem = enabled === true && points > 0 && asOf >= unlock_on
  const curMon = mondayOf(asOf)
  const missed_open_week =
    Boolean(curMon) &&
    isDateEnabled(asOf, intervals) &&
    curMon >= mondayOf(cycleStart) &&
    asOf <= sundayOf(asOf) &&
    !inCycle.some((t) => mondayOf(trainingDate(t)) === curMon)

  return {
    enabled: enabled === true,
    state: 'active',
    points,
    kcal_remainder,
    weeks_credited,
    cycle_start: cycleStart,
    unlock_on,
    can_redeem,
    missed_open_week,
    as_of: asOf,
  }
}

/**
 * @param {{ expected?: number, points?: number, can_redeem?: boolean }} p
 * @returns {boolean}
 */
export function assertRedeemAllowed(p = {}) {
  if (p.can_redeem !== true) return false
  return Number(p.expected) === Number(p.points)
}

/**
 * @param {LoyaltyAccountInput} [input]
 * @returns {LoyaltyAccountSnapshot}
 */
export function buildLoyaltyAccount(input = {}) {
  const asOf = String(input.as_of ?? '').slice(0, 10)
  const settings = normalizeLoyaltySettings(input.settings)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return idleSnapshot('', settings.enabled)
  if (input.archived_at) return idleSnapshot(asOf, settings.enabled)

  const fallbackRates = loyaltyRatesFromSettings(settings)
  const ledger = input.ledger ?? []
  const inbound = lastInboundClubMove(ledger)
  const club_moved_on = inbound
    ? String(inbound.payload?.club_moved_on ?? calendarDateFromAt(inbound.at) ?? '').slice(0, 10)
    : ''
  const club_moved_at = inbound?.at ?? null

  const eligibleCtx = {
    as_of: asOf,
    client_id: input.client_id,
    club_id: input.club_id,
    memberships: input.memberships,
    types: input.membership_types ?? input.types,
    intervals: settings.enabled_intervals,
    club_moved_on: /^\d{4}-\d{2}-\d{2}$/.test(club_moved_on) ? club_moved_on : '',
    club_moved_at,
  }

  const hard = lastHardOrigin(ledger)
  let openedBy
  let cursorDate
  let cursorAt
  if (hard) {
    openedBy = hard.kind
    cursorAt = hard.at ?? null
    cursorDate = calendarDateFromAt(hard.at)
    if (hard.kind === 'club_move' && hard.payload?.club_moved_on) {
      cursorDate = String(hard.payload.club_moved_on).slice(0, 10)
    }
  } else {
    if (!settings.enabled_at && settings.enabled_intervals.length === 0) {
      return idleSnapshot(asOf, settings.enabled)
    }
    openedBy = 'program_start'
    cursorAt = null
    cursorDate = settings.enabled_at || settings.enabled_intervals[0]?.start || ''
  }
  if (!cursorDate) return idleSnapshot(asOf, settings.enabled)

  let redeemSnapshot = null
  if (hard?.kind === 'redeem') {
    redeemSnapshot = normalizeLoyaltyRatesSnapshot(hard.snapshot, fallbackRates)
  }

  for (let safety = 0; safety < 200; safety += 1) {
    const eligible = (input.trainings ?? []).filter((t) => isLoyaltyEligibleTraining(t, eligibleCtx))

    let cycleStart
    let inCycle
    let snapshot
    if (openedBy === 'redeem') {
      cycleStart = cursorDate
      inCycle = eligible.filter((t) =>
        trainingInOpenCycle(t, {
          openedBy: 'redeem',
          cycle_start: cycleStart,
          cursorAt,
          as_of: asOf,
        }),
      )
      snapshot = redeemSnapshot || fallbackRates
    } else {
      const cutoffDate = cursorDate
      const cutoffAt = cursorAt
      const pool = eligible.filter((t) => afterCutoff(t, cutoffDate, cutoffAt))
      if (!pool.length) return idleSnapshot(asOf, settings.enabled)
      pool.sort(compareTrainings)
      const first = pool[0]
      cycleStart = trainingDate(first)
      inCycle = eligible.filter((t) => trainingDate(t) >= cycleStart && trainingDate(t) <= asOf)
      snapshot = snapshotForCycleOpen(ledger, cycleStart, fallbackRates)
    }

    const missedMon = earliestMissedWeekMonday(cycleStart, inCycle, settings.enabled_intervals, asOf)
    if (missedMon) {
      openedBy = 'miss_restart'
      cursorDate = addDaysIso(sundayOf(missedMon), 1)
      cursorAt = null
      continue
    }

    return activeSnapshot({
      asOf,
      enabled: settings.enabled,
      inCycle,
      snapshot,
      cycleStart,
      intervals: settings.enabled_intervals,
    })
  }

  return idleSnapshot(asOf, settings.enabled)
}

/**
 * Ленивая строка cycle_open: ACTIVE не с origin redeem и нет строки на этот cycle_start.
 * @param {LoyaltyAccountSnapshot} snapshot
 * @param {LoyaltyLedgerEntry[]} [ledger]
 */
export function shouldInsertLoyaltyCycleOpen(snapshot, ledger = []) {
  if (snapshot?.state !== 'active') return false
  const cycleStart = String(snapshot?.cycle_start ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleStart)) return false
  const has = (ledger ?? []).some(
    (e) => e?.kind === 'cycle_open' && String(e?.payload?.cycle_start ?? '') === cycleStart,
  )
  if (has) return false
  const hard = lastHardOrigin(ledger)
  if (hard?.kind === 'redeem') {
    const redeemDate = calendarDateFromAt(hard.at)
    if (redeemDate === cycleStart) return false
  }
  return true
}
