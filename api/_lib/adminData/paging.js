import { PAGE } from './constants.js'

export async function fetchPaged(supabaseAdmin, table, select, clubId, dateFrom, dateTo) {
  const rows = []
  let from = 0
  for (;;) {
    let q = supabaseAdmin.from(table).select(select).eq('club_id', clubId)
    if (table === 'trainings' && dateFrom && dateTo) {
      q = q.gte('date', dateFrom).lte('date', dateTo)
    }
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return rows
}

/** min/max год завершённых тренировок клуба — без полного pull. */
export async function fetchCompletedTrainingYearBounds(supabaseAdmin, clubId) {
  const base = () =>
    supabaseAdmin.from('trainings').select('date').eq('club_id', clubId).eq('status', 'completed')
  const [minRes, maxRes] = await Promise.all([
    base().order('date', { ascending: true }).limit(1).maybeSingle(),
    base().order('date', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (minRes.error) throw minRes.error
  if (maxRes.error) throw maxRes.error
  const minYear = Number(String(minRes.data?.date ?? '').slice(0, 4))
  const maxYear = Number(String(maxRes.data?.date ?? '').slice(0, 4))
  return {
    minYear: Number.isFinite(minYear) && minYear >= 2000 ? minYear : null,
    maxYear: Number.isFinite(maxYear) && maxYear >= 2000 ? maxYear : null,
  }
}
