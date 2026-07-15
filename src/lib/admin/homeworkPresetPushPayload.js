/**
 * Payload homework_presets для push-record.
 */
import { normalizeHomeworkPresetRow } from '../homework/homeworkPresetsCore.js'

export function normalizeHomeworkPresetPushPayload(data) {
  const row = normalizeHomeworkPresetRow(data)
  if (!row) return null
  return {
    id: row.id,
    club_id: row.club_id,
    title: row.title,
    direction: row.direction,
    description: row.description,
    items: row.items,
    sort_order: row.sort_order,
    is_active: row.is_active,
    updated_at: new Date().toISOString(),
  }
}
