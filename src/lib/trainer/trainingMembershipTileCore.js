/**
 * Плитка «Трен. n/m» на форме тренировки — та же правда, что подпись в дневнике карточки.
 * Завершённая: номер по хронологии на абонементе.
 * Черновик: следующая (effective used + 1) на usable абонементе на дату.
 * effective used = max(поле used_trainings, число completed в дневнике) —
 * иначе при отстающем поле первый заход в черновик показывает 1/8 вместо 2/8.
 */

import { resolveEffectiveMembershipUsed } from '../membership/membershipTotalGuardCore.js'
import {
  completedWorkoutNumberOnMembership,
  countedUsedTrainingsOnMembership,
  pickUsableMembershipForDate,
  resolveMembershipForDiaryTraining,
} from '../membershipRules.js'

/**
 * @param {{
 *   memberships?: object[],
 *   allTrainings?: object[],
 *   training?: object | null,
 *   trainingDate?: string | null,
 *   status?: string | null,
 *   fallbackDate?: string | null,
 * }} input
 * @returns {{ current: number, total: number, endDate: string | null, membershipId: string } | null}
 */
export function buildTrainingMembershipTileSummary(input = {}) {
  const memberships = Array.isArray(input.memberships) ? input.memberships : []
  const allTrainings = Array.isArray(input.allTrainings) ? input.allTrainings : []
  if (!memberships.length) return null

  const training = input.training && typeof input.training === 'object' ? input.training : null
  const date = String(input.trainingDate ?? training?.date ?? input.fallbackDate ?? '').slice(0, 10)
  const status = String(input.status ?? training?.status ?? 'draft')

  if (status === 'completed' && training?.id) {
    const day = date || String(training.date ?? '').slice(0, 10)
    if (!day) return null
    const row = { ...training, date: day, status: 'completed' }
    const m = resolveMembershipForDiaryTraining(row, day, memberships)
    if (!m?.id) return null
    const total = Number(m.total_trainings)
    if (!Number.isFinite(total) || total <= 0) return null
    const n = completedWorkoutNumberOnMembership(row, m, allTrainings)
    if (n == null || !Number.isFinite(n) || n < 1) return null
    return {
      current: n,
      total,
      endDate: m.end_date ? String(m.end_date) : null,
      membershipId: String(m.id),
    }
  }

  if (!date) return null
  const m = pickUsableMembershipForDate(memberships, date)
  if (!m?.id) return null
  const total = Number(m.total_trainings)
  if (!Number.isFinite(total) || total <= 0) return null
  const used = resolveEffectiveMembershipUsed(
    m.used_trainings,
    countedUsedTrainingsOnMembership(m, allTrainings),
  )
  if (used >= total) return null
  return {
    current: Math.min(used + 1, total),
    total,
    endDate: m.end_date ? String(m.end_date) : null,
    membershipId: String(m.id),
  }
}
