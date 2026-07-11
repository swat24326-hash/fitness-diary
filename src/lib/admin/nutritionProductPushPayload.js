/**
 * Payload nutrition_products для push-record.
 */
import { normalizeNutritionProductRow } from '../nutrition/nutritionProductsCore.js'

export function normalizeNutritionProductPushPayload(data) {
  const row = normalizeNutritionProductRow(data)
  if (!row) return null
  return {
    id: row.id,
    club_id: row.club_id,
    label: row.label,
    macro_group: row.macro_group,
    protein_per100: row.protein_per100,
    fat_per100: row.fat_per100,
    carbs_per100: row.carbs_per100,
    piece_grams: row.piece_grams,
    tags: row.tags,
    sort_order: row.sort_order,
    is_active: row.is_active,
    updated_at: new Date().toISOString(),
  }
}
