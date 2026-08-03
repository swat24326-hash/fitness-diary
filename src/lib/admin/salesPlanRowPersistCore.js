/**
 * Частичная запись club_sales_plan без upsert.
 *
 * PostgREST/Supabase upsert с неполным телом (только strategy_snapshot или только levels)
 * при конфликте может обнулить остальные колонки — план «пропадает» после «Посчитать» / сохранения уровней.
 * Поэтому: UPDATE существующих полей → если строки нет, INSERT.
 */

/**
 * @param {{
 *   from: (table: string) => any,
 * }} client supabase / supabaseAdmin
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   patch: Record<string, unknown>,
 *   selectCols: string,
 * }} opts
 * @returns {Promise<{ data: object|null, error: { message?: string }|null, wrote: 'update'|'insert'|null }>}
 */
export async function patchOrInsertClubSalesPlanRow(client, opts) {
  const clubId = String(opts?.clubId ?? '').trim()
  const year = Number(opts?.year)
  const month = Number(opts?.month)
  const patch = opts?.patch && typeof opts.patch === 'object' ? opts.patch : null
  const selectCols = String(opts?.selectCols ?? '').trim()
  if (!client || !clubId || !Number.isFinite(year) || !Number.isFinite(month) || !patch || !selectCols) {
    return { data: null, error: { message: 'patchOrInsertClubSalesPlanRow: bad args' }, wrote: null }
  }

  const updated_at =
    typeof patch.updated_at === 'string' && patch.updated_at
      ? patch.updated_at
      : new Date().toISOString()
  const body = { ...patch, updated_at }

  const { data: updated, error: updateError } = await client
    .from('club_sales_plan')
    .update(body)
    .eq('club_id', clubId)
    .eq('year', year)
    .eq('month', month)
    .select(selectCols)
    .maybeSingle()

  if (updateError) return { data: null, error: updateError, wrote: null }
  if (updated) return { data: updated, error: null, wrote: 'update' }

  const { data: inserted, error: insertError } = await client
    .from('club_sales_plan')
    .insert({ club_id: clubId, year, month, ...body })
    .select(selectCols)
    .single()

  if (insertError) return { data: null, error: insertError, wrote: null }
  return { data: inserted, error: null, wrote: 'insert' }
}
