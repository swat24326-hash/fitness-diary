/**
 * /me/trainings: тренировки по абонементу — дневник ПЗ + списания АЗ (session_visits).
 * Неявки в списке с пометкой. АЗ — kind=desk, без окна подходов.
 * Сырой session_visits наружу не уходит.
 */
import { normalizeSessionVisits } from '../../../src/lib/admin/deskAzSessionDeductCore.js'
import { parseWeightKg } from '../../../src/lib/clientWeightCore.js'
import { isLoyaltyNoShowTraining } from '../../../src/lib/loyalty/loyaltyTrainingEligibleCore.js'
import { normalizeMembershipHall } from '../../../src/lib/membershipHallCore.js'
import { completedTrainingsOnMembership } from '../../../src/lib/membershipRules.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MAX_VISITS = 200
const FOCUS_MAX = 60
const day = (v) => String(v ?? '').slice(0, 10)
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, FOCUS_MAX)

function parseData(raw) {
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw ?? ''))
  } catch {
    return {}
  }
}

/**
 * Списания у стойки АЗ → view-строки (без окна тренировки).
 * @param {object|null|undefined} membership
 * @param {string} [directionLabel]
 */
export function buildDeskMembershipVisits(membership, directionLabel = '') {
  const focus = clean(directionLabel) || null
  return normalizeSessionVisits(membership?.session_visits)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
    .slice(-MAX_VISITS)
    .map((v) => ({
      id: String(v.id),
      date: v.date,
      focus,
      kg: null,
      trainer_name: null,
      no_show: false,
      kind: /** @type {const} */ ('desk'),
    }))
}

/**
 * @param {Map<string, string>} [trainerNameById]
 * @param {{ hall?: unknown, directionLabel?: string }} [opts]
 * @returns {{ id: string, date: string, focus: string|null, kg: number|null, trainer_name: string|null, no_show: boolean, kind?: 'personal'|'desk' }[]}
 */
export function buildMembershipVisits(membership, trainings, trainerNameById, opts = {}) {
  const hall = normalizeMembershipHall(opts.hall ?? membership?.hall) ?? 'pz'
  /** АЗ на вкладке «Тренировки» — только списания у стойки, не legacy-дневник ПЗ. */
  if (hall === 'az') {
    return buildDeskMembershipVisits(membership, opts.directionLabel)
  }

  const personal = completedTrainingsOnMembership(membership, trainings)
    .filter((t) => ISO.test(day(t.date)))
    .slice(-MAX_VISITS)
    .map((t) => {
      const data = parseData(t.data)
      const noShow = isLoyaltyNoShowTraining({ ...t, data })
      return {
        id: String(t.id ?? ''),
        date: day(t.date),
        focus: noShow ? null : clean(data.training_focus) || clean(t.type) || null,
        kg: noShow ? null : parseWeightKg(data.pre_weight_kg),
        trainer_name: trainerNameById?.get(String(t.trainer_id ?? '')) || null,
        no_show: noShow,
        kind: /** @type {const} */ ('personal'),
      }
    })

  return personal
}

/** @returns {string[]} тренеры тренировок по этим абонементам — подгрузить имена одним запросом */
export function membershipVisitTrainerIds(memberships, trainings) {
  const ids = (memberships ?? []).flatMap((m) =>
    completedTrainingsOnMembership(m, trainings).map((t) => String(t.trainer_id ?? '')),
  )
  return [...new Set(ids.filter(Boolean))]
}
