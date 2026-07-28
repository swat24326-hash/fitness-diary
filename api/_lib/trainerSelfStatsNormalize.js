/**
 * PostgREST `membership_id:data->>membership_id` → вид, понятный payroll agg.
 * @param {object} row
 */
export function normalizeTrainingRowForPayroll(row) {
  if (!row || typeof row !== 'object') return row
  if (row.data && typeof row.data === 'object' && row.data.membership_id != null) {
    return row
  }
  const mid = row.membership_id ?? row.data?.membership_id
  if (mid == null || mid === '') {
    return { ...row, data: row.data && typeof row.data === 'object' ? row.data : {} }
  }
  return {
    ...row,
    data: { ...(typeof row.data === 'object' && row.data ? row.data : {}), membership_id: mid },
  }
}
