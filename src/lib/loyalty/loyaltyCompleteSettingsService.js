/**
 * Живые ставки клуба на first complete (max_minutes / max_kcal).
 * Офлайн или нет таблиц → null → дефолт 60/800 в persist.
 */

import { isAppOnline } from '../networkReachability.js'
import { fetchLoyaltySettings } from './loyaltyApiClient.js'
import { LOYALTY_COMPLETE_SETTINGS_TIMEOUT_MS } from './loyaltyTimeoutCore.js'
import { interpretLoyaltySettingsHttp } from './loyaltySettingsUiCore.js'

/**
 * @param {string|null|undefined} clubId
 * @returns {Promise<object|null>}
 */
export async function loadLoyaltyCompleteSettings(clubId) {
  const club = String(clubId ?? '').trim()
  if (!club || !isAppOnline()) return null
  try {
    const data = await fetchLoyaltySettings(club, LOYALTY_COMPLETE_SETTINGS_TIMEOUT_MS)
    const parsed = interpretLoyaltySettingsHttp(200, data)
    if (!parsed.ok || parsed.migration_needed) return null
    return parsed.settings
  } catch (e) {
    const parsed = interpretLoyaltySettingsHttp(e?.status ?? 500, e?.body ?? { error: e?.message })
    if (parsed.ok && !parsed.migration_needed) return parsed.settings
    return null
  }
}
