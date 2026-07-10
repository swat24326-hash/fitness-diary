const DEFAULT_PAGE = 500

/**
 * Постраничный select с лимитом строк (защита памяти Vercel).
 * @returns {Promise<{ rows: object[], truncated: boolean }>}
 */
export async function fetchPagedLimited(
  supabaseAdmin,
  { table, select, clubId, dateFrom = null, dateTo = null, maxRows = Infinity, pageSize = DEFAULT_PAGE },
) {
  const rows = []
  let from = 0
  let truncated = false
  const cap = Number.isFinite(maxRows) && maxRows > 0 ? maxRows : Infinity

  for (;;) {
    if (rows.length >= cap) {
      truncated = true
      break
    }
    let q = supabaseAdmin.from(table).select(select).eq('club_id', clubId)
    if (table === 'trainings' && dateFrom && dateTo) {
      q = q.gte('date', dateFrom).lte('date', dateTo)
    }
    const room = cap - rows.length
    const limit = Math.min(pageSize, room)
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + limit - 1)
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < limit) break
    from += limit
    if (rows.length >= cap) {
      truncated = true
      break
    }
  }

  return { rows, truncated }
}
