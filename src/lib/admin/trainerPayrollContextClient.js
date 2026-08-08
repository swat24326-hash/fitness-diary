/**
 * Клиентский контекст ЗП: план клуба + кабинеты (для локальных сводок).
 */
import { normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'
import { indexTrainerPayProfilesByTrainerId } from './trainerPayProfileCore.js'
import { fetchTrainerPayPlanSettings } from './trainerPayPlanSettingsService.js'
import { fetchTrainerPayProfiles } from './trainerPayProfileSettingsService.js'

/** @param {string} clubId */
export async function loadTrainerPayrollContextClient(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) {
    return {
      planConfig: normalizeTrainerPayPlanConfig(null),
      profilesByTrainerId: new Map(),
      clubId: '',
    }
  }
  const [planRes, profilesRes] = await Promise.all([
    fetchTrainerPayPlanSettings(cid).catch(() => null),
    fetchTrainerPayProfiles(cid).catch(() => null),
  ])
  return {
    planConfig: normalizeTrainerPayPlanConfig(planRes?.config),
    profilesByTrainerId: indexTrainerPayProfilesByTrainerId(profilesRes?.profiles ?? []),
    clubId: cid,
  }
}
