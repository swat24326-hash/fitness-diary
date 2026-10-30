/**
 * Направление АЗ на групповом слоте ежедневника.
 */
import { SCHEDULE_KIND_GROUP } from './trainerScheduleKindCore.js'

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

/** @param {unknown} raw */
export function isScheduleDirectionUuid(raw) {
  return UUID_RE.test(String(raw ?? '').trim())
}

/**
 * Направление только у группового слота.
 * @param {unknown} kind
 * @param {unknown} directionTypeId
 * @returns {string|null}
 */
export function coerceScheduleDirectionTypeId(kind, directionTypeId) {
  if (String(kind ?? '') !== SCHEDULE_KIND_GROUP) return null
  const id = String(directionTypeId ?? '').trim()
  return isScheduleDirectionUuid(id) ? id : null
}
