/**
 * Контекст ЗП клуба: пороги плана + кабинеты тренеров (service role).
 */
import { loadClubTrainerPayPlanSettings } from './trainerPayPlanSettingsHandler.js'
import { loadTrainerPayProfilesMapForClub } from './trainerPayProfileSettingsHandler.js'
import { normalizeTrainerPayPlanConfig } from '../../src/lib/admin/trainerPayPlanCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
export async function loadTrainerPayrollContext(supabaseAdmin, clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) {
    return {
      planConfig: normalizeTrainerPayPlanConfig(null),
      profilesByTrainerId: new Map(),
    }
  }
  const [planRow, profilesPack] = await Promise.all([
    loadClubTrainerPayPlanSettings(supabaseAdmin, cid).catch(() => ({
      config: normalizeTrainerPayPlanConfig(null),
    })),
    loadTrainerPayProfilesMapForClub(supabaseAdmin, cid).catch(() => ({
      map: new Map(),
    })),
  ])
  return {
    planConfig: normalizeTrainerPayPlanConfig(planRow?.config),
    profilesByTrainerId: profilesPack?.map ?? new Map(),
    clubId: cid,
  }
}

/**
 * @param {object} ctx from loadTrainerPayrollContext
 * @param {Array<object>} membershipTypes
 * @param {{ trainerIdFilter?: string|null }} [extra]
 */
export function payrollOptsFromContext(ctx, membershipTypes, extra = {}) {
  return {
    membershipTypes,
    planConfig: ctx.planConfig,
    profilesByTrainerId: ctx.profilesByTrainerId,
    clubId: ctx.clubId,
    ...extra,
  }
}
