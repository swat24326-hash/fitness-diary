/**
 * Устойчивые SELECT для club_sales_* — fallback при отсутствии новых колонок после миграций.
 */
import {
  SALES_MONTH_DAILY_SELECT,
  SALES_MONTH_DAILY_SELECT_WITHOUT_REFUNDS,
  SALES_MATRIX_HALL_KEYS,
  SALES_MATRIX_KEYS,
} from './salesReportCore.js'

export const SALES_DAILY_SELECT_FULL =
  'id, club_id, report_date, profit_nk, profit_dk, profit_uk, profit_day, pnk_total, trainings_count, trainings_matrix, aerobic_sales_matrix, matrix_amounts, refunds_amount, pz_nk, pz_dk, pz_uk, tz_nk, tz_dk, tz_uk, az_nk, az_dk, az_uk, dop_nk, dop_dk, dop_uk, updated_at'

export const SALES_DAILY_SELECT_WITHOUT_REFUNDS =
  'id, club_id, report_date, profit_nk, profit_dk, profit_uk, profit_day, pnk_total, trainings_count, trainings_matrix, aerobic_sales_matrix, matrix_amounts, pz_nk, pz_dk, pz_uk, tz_nk, tz_dk, tz_uk, az_nk, az_dk, az_uk, dop_nk, dop_dk, dop_uk, updated_at'

export const SALES_DAILY_SELECT_BASE =
  'id, club_id, report_date, profit_nk, profit_dk, profit_uk, profit_day, pnk_total, trainings_count, trainings_matrix, pz_nk, pz_dk, pz_uk, tz_nk, tz_dk, tz_uk, az_nk, az_dk, az_uk, dop_nk, dop_dk, dop_uk, updated_at'

export const SALES_PLAN_SELECT_WITH_SNAPSHOT =
  'plan_total, plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az, plan_extra, plan_matrix, strategy_snapshot, updated_at'

export const SALES_PLAN_SELECT_FULL =
  'plan_total, plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az, plan_extra, plan_matrix, updated_at'

export const SALES_PLAN_SELECT_WITHOUT_MATRIX =
  'plan_total, plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az, plan_extra, updated_at'

export const SALES_PLAN_SELECT_BASE =
  'plan_total, plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az, updated_at'

export const SALES_MONTH_DAILY_SELECT_NO_AMOUNTS = [
  'report_date',
  'profit_nk',
  'profit_dk',
  'profit_uk',
  'profit_day',
  'pnk_total',
  'trainings_count',
  'trainings_matrix',
  'aerobic_sales_matrix',
  ...SALES_MATRIX_KEYS,
].join(', ')

export const SALES_MONTH_DAILY_SELECT_LEGACY = [
  'report_date',
  'profit_nk',
  'profit_dk',
  'profit_uk',
  'profit_day',
  'pnk_total',
  'trainings_count',
  'trainings_matrix',
  'aerobic_sales_matrix',
  ...SALES_MATRIX_HALL_KEYS,
].join(', ')

/** @param {unknown} err */
export function isMissingSalesColumnError(err) {
  const code = String(err?.code ?? '')
  if (code === 'PGRST204' || code === '42703') return true
  const blob = [
    err?.message,
    err?.details,
    err?.hint,
    typeof err === 'string' ? err : '',
  ]
    .map((x) => String(x ?? '').toLowerCase())
    .join(' ')
  return (
    blob.includes('strategy_snapshot') ||
    blob.includes('matrix_amounts') ||
    blob.includes('aerobic_sales_matrix') ||
    blob.includes('plan_extra') ||
    blob.includes('refunds_amount') ||
    blob.includes('dop_nk') ||
    blob.includes('dop_dk') ||
    blob.includes('dop_uk') ||
    blob.includes('does not exist') ||
    blob.includes('schema cache') ||
    blob.includes('could not find') ||
    blob.includes('column')
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} clubId
 * @param {string} reportDate
 */
export async function querySalesDailyRow(client, clubId, reportDate) {
  const run = (cols) =>
    client.from('club_sales_daily').select(cols).eq('club_id', clubId).eq('report_date', reportDate).maybeSingle()

  let res = await run(SALES_DAILY_SELECT_FULL)
  if (res.error && isMissingSalesColumnError(res.error)) {
    res = await run(SALES_DAILY_SELECT_WITHOUT_REFUNDS)
  }
  if (res.error && isMissingSalesColumnError(res.error)) {
    res = await run(SALES_DAILY_SELECT_BASE)
  }
  return res
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} clubId
 * @param {string} start
 * @param {string} end
 */
export async function querySalesMonthRows(client, clubId, start, end) {
  const selects = [
    SALES_MONTH_DAILY_SELECT,
    SALES_MONTH_DAILY_SELECT_WITHOUT_REFUNDS,
    SALES_MONTH_DAILY_SELECT_NO_AMOUNTS,
    SALES_MONTH_DAILY_SELECT_LEGACY,
  ]
  let lastError = null
  for (const select of selects) {
    const res = await client
      .from('club_sales_daily')
      .select(select)
      .eq('club_id', clubId)
      .gte('report_date', start)
      .lte('report_date', end)
      .order('report_date', { ascending: true })
    if (!res.error) return res
    lastError = res.error
    if (!isMissingSalesColumnError(res.error)) return res
  }
  return { data: null, error: lastError }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 */
export async function querySalesPlanRow(client, clubId, year, month) {
  const run = (cols) =>
    client
      .from('club_sales_plan')
      .select(cols)
      .eq('club_id', clubId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle()

  let res = await run(SALES_PLAN_SELECT_WITH_SNAPSHOT)
  if (res.error && isMissingSalesColumnError(res.error)) {
    res = await run(SALES_PLAN_SELECT_FULL)
  }
  if (res.error && isMissingSalesColumnError(res.error)) {
    res = await run(SALES_PLAN_SELECT_WITHOUT_MATRIX)
  }
  if (res.error && isMissingSalesColumnError(res.error)) {
    res = await run(SALES_PLAN_SELECT_BASE)
  }
  return res
}
