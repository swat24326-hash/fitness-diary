/**
 * Payload trainer_schedule_entries для push-record.
 */
import { normalizeTrainerScheduleEntry } from './trainerScheduleCore.js'
import { coerceScheduleKindForEntry } from './trainerScheduleKindCore.js'

/** @param {unknown} data */
export function normalizeTrainerSchedulePushPayload(data) {
  const row = normalizeTrainerScheduleEntry(data)
  if (!row) return null
  const { synced: _s, ...payload } = row
  /* Старый бандл не знает про kind — не затирать категорию, выбранную на другом планшете. */
  const hasKind = Boolean(data) && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'kind')
  if (!hasKind) {
    delete payload.kind
    return payload
  }
  payload.kind = coerceScheduleKindForEntry(payload.kind, payload.client_ids)
  return payload
}
