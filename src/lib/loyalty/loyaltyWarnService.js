/**
 * Цифра для предупреждения архива / переезда: GET account или last-good, не выдумываем 0.
 */

import { getLoyaltyGlance } from './loyaltyGlanceCache.js'
import { loadLoyaltyAccountWithCache } from './loyaltyGlanceService.js'
import { isLoyaltySnapshot, shouldShowLoyaltyUi } from './loyaltyGlanceUiCore.js'

/**
 * @param {object|null|undefined} client
 * @returns {Promise<{ show: boolean, known: boolean, points: number }>}
 */
export async function loadLoyaltyWarnSnapshot(client) {
  if (!shouldShowLoyaltyUi(client)) return { show: false, known: false, points: 0 }
  const id = String(client?.id ?? '').trim()
  if (!id) return { show: false, known: false, points: 0 }
  try {
    const r = await loadLoyaltyAccountWithCache(id)
    if (isLoyaltySnapshot(r.snapshot)) {
      return { show: true, known: true, points: Number(r.snapshot.points) || 0 }
    }
  } catch {
    /* last-good ниже */
  }
  const cached = await getLoyaltyGlance(id)
  if (isLoyaltySnapshot(cached)) {
    return { show: true, known: true, points: Number(cached.points) || 0 }
  }
  return { show: true, known: false, points: 0 }
}
