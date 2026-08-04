/**
 * Режим тренера ПЗ: с планшетом / без (lite-клиенты).
 * Без React / IDB.
 */

import { clientDeskHall } from './deskHallClientsCore.js'

function isDeskHallClient(client) {
  return clientDeskHall(client) != null
}

/**
 * @param {object|null|undefined} user
 */
export function isTrainerWithoutTablet(user) {
  return user != null && user.uses_tablet === false
}

/**
 * @param {Iterable<object>|null|undefined} trainers
 * @returns {Set<string>}
 */
export function collectNoTabletTrainerIds(trainers) {
  const ids = new Set()
  for (const t of trainers ?? []) {
    if (!isTrainerWithoutTablet(t)) continue
    const id = String(t?.id ?? '').trim()
    if (id) ids.add(id)
  }
  return ids
}

/**
 * @param {object|null|undefined} client
 * @param {Set<string>|string[]|null|undefined} noTabletTrainerIds
 */
export function isClientOnNoTabletTrainer(client, noTabletTrainerIds) {
  if (!client || isDeskHallClient(client)) return false
  const tid = String(client.trainer_id ?? '').trim()
  if (!tid) return false
  if (noTabletTrainerIds instanceof Set) return noTabletTrainerIds.has(tid)
  if (Array.isArray(noTabletTrainerIds)) return noTabletTrainerIds.map(String).includes(tid)
  return false
}

/**
 * Лёгкий ПЗ: живой тренер без планшета (не desk ТЗ/АЗ).
 * @param {object|null|undefined} client
 * @param {Set<string>|string[]|Map<string, object>|Record<string, object>|null|undefined} trainersOrIds
 */
export function isLitePzClient(client, trainersOrIds) {
  if (!client || isDeskHallClient(client)) return false
  const tid = String(client.trainer_id ?? '').trim()
  if (!tid) return false
  if (trainersOrIds instanceof Set || Array.isArray(trainersOrIds)) {
    return isClientOnNoTabletTrainer(client, trainersOrIds)
  }
  if (trainersOrIds instanceof Map) {
    return isTrainerWithoutTablet(trainersOrIds.get(tid))
  }
  if (trainersOrIds && typeof trainersOrIds === 'object') {
    return isTrainerWithoutTablet(trainersOrIds[tid])
  }
  return false
}
