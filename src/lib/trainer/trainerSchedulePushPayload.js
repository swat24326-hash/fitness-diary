/**
 * Payload trainer_schedule_entries для push-record.
 */
import { normalizeTrainerScheduleEntry } from './trainerScheduleCore.js'
import { coerceScheduleDirectionTypeId } from './trainerScheduleDirectionCore.js'
import { coerceScheduleKindForEntry } from './trainerScheduleKindCore.js'

/** @param {unknown} data */
export function normalizeTrainerSchedulePushPayload(data) {
  const row = normalizeTrainerScheduleEntry(data)
  if (!row) return null
  const { synced: _s, ...payload } = row
  const obj = Boolean(data) && typeof data === 'object'
  /* Старый бандл не знает про kind — не затирать категорию, назначенную на другом планшете. */
  const hasKind = obj && Object.prototype.hasOwnProperty.call(data, 'kind')
  const hasDirection = obj && Object.prototype.hasOwnProperty.call(data, 'direction_type_id')
  if (!hasKind) {
    delete payload.kind
    if (!hasDirection) delete payload.direction_type_id
    else payload.direction_type_id = coerceScheduleDirectionTypeId(payload.kind, data.direction_type_id)
    return payload
  }
  payload.kind = coerceScheduleKindForEntry(payload.kind, payload.client_ids)
  if (hasDirection || payload.kind !== 'group') {
    payload.direction_type_id = coerceScheduleDirectionTypeId(payload.kind, hasDirection ? data.direction_type_id : payload.direction_type_id)
  } else {
    delete payload.direction_type_id
  }
  return payload
}
