/**
 * Цифра для предупреждения архива / переезда: last-good сразу, иначе короткий GET.
 * Не выдумываем 0.
 */

import { loadLoyaltyAccountWithCache } from './loyaltyGlanceService.js'
import { isLoyaltySnapshot, shouldShowLoyaltyUi } from './loyaltyGlanceUiCore.js'
import { LOYALTY_WARN_TIMEOUT_MS } from './loyaltyTimeoutCore.js'

/**
 * @param {object|null|undefined} client
 * @returns {Promise<{ show: boolean, known: boolean, points: number }>}
 */
export async function loadLoyaltyWarnSnapshot(client) {
  if (!shouldShowLoyaltyUi(client)) return { show: false, known: false, points: 0 }
  const id = String(client?.id ?? '').trim()
  if (!id) return { show: false, known: false, points: 0 }
  const r = await loadLoyaltyAccountWithCache(id, {
    preferCache: true,
    timeoutMs: LOYALTY_WARN_TIMEOUT_MS,
  })
  if (isLoyaltySnapshot(r.snapshot)) {
    return { show: true, known: true, points: Number(r.snapshot.points) || 0 }
  }
  return { show: true, known: false, points: 0 }
}
