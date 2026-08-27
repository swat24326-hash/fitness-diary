/**
 * Payload trainer_schedule_entries для push-record.
 */
import { normalizeTrainerScheduleEntry } from './trainerScheduleCore.js'

/** @param {unknown} data */
export function normalizeTrainerSchedulePushPayload(data) {
  const row = normalizeTrainerScheduleEntry(data)
  if (!row) return null
  const { synced: _s, ...payload } = row
  return payload
}
