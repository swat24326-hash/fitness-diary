/**
 * Дотянуть ФИО для trainer_id из матриц продаж (service role).
 * Менеджеру list-trainers отфильтрован по клубу — без этого в stats остаются UUID.
 */
import {
  mergeSalesTrainersForLabels,
  unresolvedTrainerIdsForLabels,
  trainerIdsFromMatrixRows,
  trainerIdsFromSalesDailyRows,
} from '../../../src/lib/admin/salesTrainerLabelsCore.js'
import { normalizeMatrixRowsFromDb } from '../../../src/lib/admin/salesTrainingsMatrix.js'

const NAME_FIELDS = 'id, name, email, login, phone, is_active, role, club_id'
const ID_CHUNK = 80

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string[]} ids
 */
async function fetchUserRowsByIds(supabaseAdmin, ids) {
  const unique = [...new Set((ids ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))]
  if (!unique.length) return []
  /** @type {object[]} */
  const rows = []
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK)
    const { data, error } = await supabaseAdmin.from('users').select(NAME_FIELDS).in('id', chunk)
    if (error) throw error
    rows.push(...(data ?? []))
  }
  return rows
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {Array<object>} clubTrainers
 * @param {{ daily?: object|null, monthRows?: Array<object>|null }} ctx
 */
export async function enrichSalesTrainersWithMatrixNames(supabaseAdmin, clubTrainers, ctx = {}) {
  const base = Array.isArray(clubTrainers) ? clubTrainers : []
  const matrixIds = [
    ...trainerIdsFromSalesDailyRows(ctx.monthRows),
    ...trainerIdsFromMatrixRows(normalizeMatrixRowsFromDb(ctx.daily?.trainings_matrix)),
  ]
  const missing = unresolvedTrainerIdsForLabels(base, matrixIds)
  if (!missing.length) {
    return mergeSalesTrainersForLabels(base, {
      daily: ctx.daily,
      monthRows: ctx.monthRows,
      nameCatalog: [],
    })
  }
  const nameCatalog = await fetchUserRowsByIds(supabaseAdmin, missing)
  return mergeSalesTrainersForLabels(base, {
    daily: ctx.daily,
    monthRows: ctx.monthRows,
    nameCatalog,
  })
}
