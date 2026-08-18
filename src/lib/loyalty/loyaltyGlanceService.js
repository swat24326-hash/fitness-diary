/**
 * Подтянуть glance пачками ≤80, записать IDB. Не внутри trainer-pull.
 */

import { dispatchLocalDataChanged } from '../localDataEvents.js'
import { isAppOnline } from '../networkReachability.js'
import { listClientsByTrainerId } from '../localDbClubQuery.js'
import { fetchLoyaltyAccount, fetchLoyaltyGlance, postLoyaltyRedeem } from './loyaltyApiClient.js'
import { getLoyaltyGlance, putLoyaltyGlance, putLoyaltyGlanceMany } from './loyaltyGlanceCache.js'
import {
  chunkLoyaltyGlanceIds,
  isLoyaltySnapshot,
  pickLoyaltyLastGood,
  shouldShowLoyaltyUi,
} from './loyaltyGlanceUiCore.js'

function groupIdsByClub(clients) {
  /** @type {Map<string, string[]>} */
  const map = new Map()
  for (const c of clients ?? []) {
    if (!shouldShowLoyaltyUi(c)) continue
    const clubId = String(c.club_id ?? '').trim()
    const id = String(c.id ?? '').trim()
    if (!clubId || !id) continue
    const list = map.get(clubId) ?? []
    list.push(id)
    map.set(clubId, list)
  }
  return map
}

/**
 * @param {string} clubId
 * @param {string[]} clientIds
 * @returns {Promise<{ ok: boolean, count: number, error?: string }>}
 */
export async function refreshLoyaltyGlanceForClub(clubId, clientIds) {
  const club = String(clubId ?? '').trim()
  const chunks = chunkLoyaltyGlanceIds(clientIds)
  if (!club || !chunks.length) return { ok: true, count: 0 }
  let count = 0
  for (const ids of chunks) {
    const data = await fetchLoyaltyGlance(club, ids)
    const byId = data?.by_id && typeof data.by_id === 'object' ? data.by_id : {}
    await putLoyaltyGlanceMany(byId)
    count += Object.keys(byId).length
  }
  return { ok: true, count }
}

/**
 * @param {object[]} clients
 */
export async function refreshLoyaltyGlanceForClients(clients) {
  if (!isAppOnline()) return { ok: true, count: 0, offline: true }
  const byClub = groupIdsByClub(clients)
  let count = 0
  let error = ''
  for (const [clubId, ids] of byClub) {
    try {
      const r = await refreshLoyaltyGlanceForClub(clubId, ids)
      count += r.count ?? 0
    } catch (e) {
      error = e?.message ? String(e.message) : 'ошибка баллов'
    }
  }
  if (count > 0 || !error) {
    dispatchLocalDataChanged({ reason: 'loyalty-glance' })
  }
  if (error && count === 0) return { ok: false, count, error }
  return { ok: true, count, error: error || undefined }
}

/** После trainer-pull: id из локального снимка тренера. */
export async function refreshLoyaltyGlanceAfterTrainerPull(trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return { ok: true, count: 0 }
  try {
    const clients = await listClientsByTrainerId(tid)
    return await refreshLoyaltyGlanceForClients(clients)
  } catch (e) {
    return { ok: false, count: 0, error: e?.message ? String(e.message) : 'ошибка баллов' }
  }
}

/**
 * Карточка: GET account, кэш last-good. Не get-client.
 * @param {string} clientId
 * @param {{ timeoutMs?: number, preferCache?: boolean }} [opts]
 *   preferCache — архив/переезд: не ждать сеть, если last-good уже есть.
 */
export async function loadLoyaltyAccountWithCache(clientId, opts = {}) {
  const id = String(clientId ?? '').trim()
  const cached = id ? await getLoyaltyGlance(id) : null
  if (!id) return { snapshot: null, source: 'none' }
  if (opts.preferCache === true && isLoyaltySnapshot(cached)) {
    return { snapshot: cached, source: 'cache' }
  }
  if (!isAppOnline()) return { snapshot: pickLoyaltyLastGood(cached, null), source: 'cache' }
  const timeoutMs = Number(opts.timeoutMs)
  try {
    const data = await fetchLoyaltyAccount(id, Number.isFinite(timeoutMs) ? timeoutMs : undefined)
    const live = data?.snapshot
    if (isLoyaltySnapshot(live)) {
      await putLoyaltyGlance(id, live)
      dispatchLocalDataChanged({ reason: 'loyalty-glance' })
      return { snapshot: live, source: 'api', ledger: data?.ledger }
    }
    return { snapshot: pickLoyaltyLastGood(cached, null), source: 'cache' }
  } catch {
    return { snapshot: pickLoyaltyLastGood(cached, null), source: 'cache' }
  }
}

/**
 * Списание куша через API (не очередь sync). Обновляет last-good.
 * @param {{ clientId: string, expectedPoints: unknown, comment?: string }} p
 */
export async function redeemLoyaltyAccount(p = {}) {
  const id = String(p.clientId ?? '').trim()
  if (!id) throw new Error('Укажите client_id')
  const data = await postLoyaltyRedeem({
    clientId: id,
    expectedPoints: p.expectedPoints,
    comment: p.comment,
  })
  const live = data?.snapshot
  if (isLoyaltySnapshot(live)) {
    await putLoyaltyGlance(id, live)
    dispatchLocalDataChanged({ reason: 'loyalty-glance' })
  }
  return data
}
