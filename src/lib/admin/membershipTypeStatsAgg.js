/** Статистика тренировок по типу абонемента (дублирует api/_lib/membershipTypeStatsAgg.js). */

export const MEMBERSHIP_TYPE_UNLABELED = '__none__'

export function trainingCountsForMembershipTypeStats(training) {
  return training?.status === 'completed'
}

export function resolveTrainingMembershipTypeKey(training, membershipById) {
  const mid = String(training?.data?.membership_id ?? '').trim()
  if (!mid) return MEMBERSHIP_TYPE_UNLABELED
  const m = membershipById.get(mid)
  if (!m) return MEMBERSHIP_TYPE_UNLABELED
  const tid = String(m.membership_type_id ?? '').trim()
  return tid || MEMBERSHIP_TYPE_UNLABELED
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

  const membershipById = new Map()
  for (const m of memberships ?? []) {
    const id = String(m?.id ?? '').trim()
    if (id) membershipById.set(id, m)
  }

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

    const typeKey = resolveTrainingMembershipTypeKey(tr, membershipById)

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
export function membershipCardTypeLabelForTraining(training, membershipById, typeCodeById) {
  const typeKey = resolveTrainingMembershipTypeKey(training, membershipById)
  return labelForMembershipTypeKey(typeKey, typeCodeById)
}
