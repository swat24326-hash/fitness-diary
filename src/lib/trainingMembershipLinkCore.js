/**
 * Привязка завершённой тренировки к абонементу (как в дневнике).
 * Чистые функции — verify без React/IDB.
 */

import { resolveMembershipForDiaryTraining } from './membershipRules.js'

/**
 * @param {object} training
 * @param {object[]} clientMemberships — абонементы одного client_id
 * @returns {object}
 */
export function ensureTrainingDataMembershipId(training, clientMemberships) {
  const data = training?.data && typeof training.data === 'object' ? { ...training.data } : {}
  if (String(data.membership_id ?? '').trim()) {
    return training?.data === data ? training : { ...training, data }
  }
  const dateStr = String(training?.date ?? '').slice(0, 10)
  const m = resolveMembershipForDiaryTraining(training, dateStr, clientMemberships ?? [])
  if (!m?.id) return training
  return { ...training, data: { ...data, membership_id: m.id } }
}

/**
 * @param {object[]} trainings
 * @param {object[]} allMemberships — абонементы клуба (client_id на строках)
 * @returns {object[]}
 */
export function repairTrainingsMembershipLinks(trainings, allMemberships) {
  const byClient = new Map()
  for (const m of allMemberships ?? []) {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid) continue
    if (!byClient.has(cid)) byClient.set(cid, [])
    byClient.get(cid).push(m)
  }
  return (trainings ?? []).map((t) => {
    if (String(t?.status ?? '') !== 'completed') return t
    const cid = String(t?.client_id ?? '').trim()
    return ensureTrainingDataMembershipId(t, byClient.get(cid) ?? [])
  })
}
