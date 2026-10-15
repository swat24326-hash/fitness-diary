import { getDb } from '../localDb.js'
import { isAppOnline } from '../networkReachability.js'
import { SCHEDULE_DELIVERY_WAIT_MS, isScheduleEntryUnsent } from './trainerScheduleDeliveryCore.js'

const STEP_MS = 400

/**
 * Ждём, пока очередь sync отправит запись (сервер подтвердил → в IDB `synced: true`). Сама не шлёт.
 * @param {string} entryId
 * @returns {Promise<import('./trainerScheduleDeliveryCore.js').ScheduleDelivery>}
 */
export async function waitScheduleEntryDelivery(entryId, timeoutMs = SCHEDULE_DELIVERY_WAIT_MS) {
  const id = String(entryId ?? '').trim()
  if (!id) return 'pending'
  if (!isAppOnline()) return 'offline'
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, STEP_MS))
    try {
      const row = await (await getDb()).get('trainer_schedule_entries', id)
      if (row && !isScheduleEntryUnsent(row)) return 'sent'
    } catch {
      return 'pending'
    }
  }
  return isAppOnline() ? 'pending' : 'offline'
}
