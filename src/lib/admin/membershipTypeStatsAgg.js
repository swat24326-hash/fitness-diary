/** Статистика тренировок по типу абонемента (зеркало: api/_lib/membershipTypeStatsAgg.js реэкспорт). */

import { resolveMembershipForDiaryTraining } from '../membershipRules.js'
import { isPnkTrialMembershipType } from '../membershipTypesCore.js'

export const MEMBERSHIP_TYPE_UNLABELED = '__none__'

export function trainingCountsForMembershipTypeStats(training) {
  return training?.status === 'completed'
}

/**
 * @param {object[]|null|undefined} membershipTypes
 * @returns {Map<string, object>}
 */
export function buildMembershipTypeById(membershipTypes) {
  const typeById = new Map()
  for (const t of membershipTypes ?? []) {
    const id = String(t?.id ?? '').trim()
    if (id) typeById.set(id, t)
  }
  return typeById
}

/**
 * Учётный тип для объёма / «Проведено» / таблицы типов: не «Без типа» и не БЗ (ПНК).
 * @param {string} typeKey
 * @param {Map<string, object>|null|undefined} typeById
 */
export function membershipTypeKeyCountsInVolumeStats(typeKey, typeById) {
  const key = String(typeKey ?? '').trim()
  if (!key || key === MEMBERSHIP_TYPE_UNLABELED) return false
  const t = typeById?.get?.(key)
  if (!t) return true
  if (isPnkTrialMembershipType(t)) return false
  const code = String(t.code ?? '').trim().toUpperCase()
  const name = String(t.name ?? '').trim().toUpperCase()
  if (code === 'БЗ' || name === 'БЗ' || code === 'BZ' || name === 'BZ') return false
  return true
}

/**
 * @param {object[]} memberships
 * @returns {{ membershipById: Map<string, object>, membershipsByClientId: Map<string, object[]> }}
 */
export function buildMembershipStatsIndex(memberships) {
  const membershipById = new Map()
  const membershipsByClientId = new Map()
  for (const m of memberships ?? []) {
    const id = String(m?.id ?? '').trim()
    if (id) membershipById.set(id, m)
    const cid = String(m?.client_id ?? '').trim()
    if (!cid) continue
    if (!membershipsByClientId.has(cid)) membershipsByClientId.set(cid, [])
    membershipsByClientId.get(cid).push(m)
  }
  return { membershipById, membershipsByClientId }
}

/**
 * @param {object} training
 * @param {Map<string, object>} membershipById
 * @param {Map<string, object[]>|null} [membershipsByClientId] — фоллбэк как в дневнике (по дате)
 */
export function resolveTrainingMembershipTypeKey(training, membershipById, membershipsByClientId = null) {
  const mid = String(training?.data?.membership_id ?? '').trim()
  let m = mid ? membershipById.get(mid) : null

  if (!m && membershipsByClientId) {
    const cid = String(training?.client_id ?? '').trim()
    const dateStr = String(training?.date ?? '').slice(0, 10)
    const clientMems = membershipsByClientId.get(cid) ?? []
    if (dateStr && clientMems.length) {
      m = resolveMembershipForDiaryTraining(training, dateStr, clientMems)
    }
  }

  if (!m) return MEMBERSHIP_TYPE_UNLABELED
  const tid = String(m.membership_type_id ?? '').trim()
  return tid || MEMBERSHIP_TYPE_UNLABELED
}

/**
 * Завершённая тренировка входит в объём клуба/тренера (не БЗ, не личная «Без типа»).
 */
export function trainingCountsInVolumeStats(training, membershipById, membershipsByClientId, typeById) {
  if (!trainingCountsForMembershipTypeStats(training)) return false
  const typeKey = resolveTrainingMembershipTypeKey(training, membershipById, membershipsByClientId)
  return membershipTypeKeyCountsInVolumeStats(typeKey, typeById)
}

/**
 * Оставить completed/draft, которые входят в объём статистики (как «Проведено» / «По дням»).
 * @param {object[]|null|undefined} trainings
 * @param {object[]|null|undefined} memberships
 * @param {object[]|null|undefined} membershipTypes
 */
export function filterTrainingsForVolumeStats(trainings, memberships, membershipTypes) {
  const { membershipById, membershipsByClientId } = buildMembershipStatsIndex(memberships)
  const typeById = buildMembershipTypeById(membershipTypes)
  return (trainings ?? []).filter((tr) => {
    const status = String(tr?.status ?? '')
    if (status !== 'completed' && status !== 'draft') return false
    const typeKey = resolveTrainingMembershipTypeKey(tr, membershipById, membershipsByClientId)
    return membershipTypeKeyCountsInVolumeStats(typeKey, typeById)
  })
}

/**
 * Только завершённые из объёма (журнал «Проведённые»).
 */
export function filterCompletedTrainingsForVolumeStats(trainings, memberships, membershipTypes) {
  return filterTrainingsForVolumeStats(trainings, memberships, membershipTypes).filter(
    (t) => String(t?.status ?? '') === 'completed',
  )
}

function typeLabel(typeKey, typeCodeById) {
  if (typeKey === MEMBERSHIP_TYPE_UNLABELED) return 'Без типа'
  return typeCodeById.get(typeKey) || '—'
}

function sortTypeRows(rows) {
  return rows.sort((a, b) => {
    if (a.typeId == null && b.typeId != null) return 1
    if (a.typeId != null && b.typeId == null) return -1
    return b.count - a.count || String(a.code).localeCompare(String(b.code), 'ru')
  })
}

export function aggregateMembershipTypeStats(input) {
  const { trainings, memberships, membershipTypes = [], trainerIdFilter = null } = input

  const { membershipById, membershipsByClientId } = buildMembershipStatsIndex(memberships)
  const typeById = buildMembershipTypeById(membershipTypes)

  const typeCodeById = new Map()
  for (const t of membershipTypes ?? []) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    const code = String(t.code ?? t.name ?? '').trim()
    typeCodeById.set(id, code || '—')
  }

  const trainerTypeMap = new Map()
  const clubTypeMap = new Map()

  for (const tr of trainings ?? []) {
    if (!trainingCountsForMembershipTypeStats(tr)) continue
    const trainerId = String(tr.trainer_id ?? '').trim()
    if (trainerIdFilter && trainerId !== trainerIdFilter) continue

    const typeKey = resolveTrainingMembershipTypeKey(tr, membershipById, membershipsByClientId)
    if (!membershipTypeKeyCountsInVolumeStats(typeKey, typeById)) continue

    clubTypeMap.set(typeKey, (clubTypeMap.get(typeKey) || 0) + 1)

    if (!trainerTypeMap.has(trainerId)) trainerTypeMap.set(trainerId, new Map())
    const tm = trainerTypeMap.get(trainerId)
    tm.set(typeKey, (tm.get(typeKey) || 0) + 1)
  }

  const byType = sortTypeRows(
    [...clubTypeMap.entries()].map(([typeKey, count]) => ({
      typeId: typeKey === MEMBERSHIP_TYPE_UNLABELED ? null : typeKey,
      code: typeLabel(typeKey, typeCodeById),
      count,
    })),
  )

  const byTrainerByType = [...trainerTypeMap.entries()]
    .map(([trainerId, typeMap]) => {
      const types = sortTypeRows(
        [...typeMap.entries()].map(([typeKey, count]) => ({
          typeId: typeKey === MEMBERSHIP_TYPE_UNLABELED ? null : typeKey,
          code: typeLabel(typeKey, typeCodeById),
          count,
        })),
      )
      const total = types.reduce((s, x) => s + x.count, 0)
      return { trainerId, total, byType: types }
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || String(a.trainerId).localeCompare(String(b.trainerId)))

  const totalCounted = byType.reduce((s, x) => s + x.count, 0)

  return { byType, byTrainerByType, totalCounted }
}

function labelForMembershipTypeKey(typeKey, typeCodeById) {
  if (typeKey === MEMBERSHIP_TYPE_UNLABELED) return 'Без типа'
  return typeCodeById.get(typeKey) || '—'
}

/** Подпись типа абонемента для строки журнала завершённых тренировок. */
export function membershipCardTypeLabelForTraining(
  training,
  membershipById,
  typeCodeById,
  membershipsByClientId = null,
) {
  const typeKey = resolveTrainingMembershipTypeKey(training, membershipById, membershipsByClientId)
  return labelForMembershipTypeKey(typeKey, typeCodeById)
}
