import { isPnkTrialTypeRow } from '../pnk/pnkTrialTrainingCore.js'
import { resolveMembershipForDiaryTraining } from '../membershipRules.js'
import { isDateEnabled } from './loyaltyEnabledCore.js'

/**
 * @typedef {object} LoyaltyEligibleCtx
 * @property {string} as_of
 * @property {string} client_id
 * @property {string} [club_id]
 * @property {object[]} [memberships]
 * @property {object[]} [types]
 * @property {object[]} [membership_types]
 * @property {unknown} [intervals]
 * @property {string} [club_moved_on]
 * @property {string | null} [club_moved_at]
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/

function trainingDate(t) {
  const d = String(t?.date ?? '').slice(0, 10)
  return ISO.test(d) ? d : ''
}

function completedAtIso(t) {
  const a = t?.data?.loyalty?.completed_at ?? t?.completed_at
  if (a == null || a === '') return null
  const s = String(a)
  return Number.isFinite(Date.parse(s)) ? s : null
}

export function isLoyaltyNoShowTraining(t) {
  if (t?.data?.is_writeoff === true) return true
  if (String(t?.type ?? '') === 'Списание') return true
  const focus = String(t?.data?.training_focus ?? '')
  return /списание\s*\(\s*неявка\s*\)/i.test(focus)
}

function laterThan(isoA, isoB) {
  const ta = Date.parse(String(isoA ?? ''))
  const tb = Date.parse(String(isoB ?? ''))
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false
  return ta > tb
}

function resolveMembership(t, ctx) {
  const memberships = ctx.memberships ?? []
  const mid = t?.data?.membership_id
  if (mid) {
    const hit = memberships.find((m) => String(m?.id) === String(mid))
    if (hit) return hit
  }
  return resolveMembershipForDiaryTraining(t, trainingDate(t), memberships)
}

function isPzHall(membership) {
  const hall = String(membership?.hall ?? '').trim().toLowerCase()
  return hall !== 'tz' && hall !== 'az'
}

/**
 * @param {object | null | undefined} t
 * @param {LoyaltyEligibleCtx} [ctx]
 * @returns {boolean}
 */
export function isLoyaltyEligibleTraining(t, ctx = {}) {
  const clientId = String(ctx.client_id ?? '')
  if (!t || String(t.client_id ?? '') !== clientId) return false
  if (String(t.status ?? '') !== 'completed') return false
  if (isLoyaltyNoShowTraining(t)) return false

  const date = trainingDate(t)
  const asOf = String(ctx.as_of ?? '').slice(0, 10)
  if (!date || !ISO.test(asOf) || date > asOf) return false
  if (!isDateEnabled(date, ctx.intervals)) return false

  const movedOn = String(ctx.club_moved_on ?? '').slice(0, 10)
  if (ISO.test(movedOn)) {
    if (date < movedOn) return false
    if (date === movedOn) {
      const done = completedAtIso(t)
      const movedAt = ctx.club_moved_at
      if (!done || !movedAt || !laterThan(done, movedAt)) return false
    }
  }

  const membership = resolveMembership(t, ctx)
  if (!membership) return false
  if (!isPzHall(membership)) return false

  const types = ctx.types ?? ctx.membership_types ?? []
  const typeId = String(membership.membership_type_id ?? membership.type_id ?? '')
  const typeRow = types.find((x) => String(x?.id) === typeId) ?? null
  if (isPnkTrialTypeRow(typeRow)) return false

  return true
}

/**
 * @param {object | null | undefined} t
 * @returns {string | null}
 */
export function trainingCompletedAt(t) {
  return completedAtIso(t)
}
