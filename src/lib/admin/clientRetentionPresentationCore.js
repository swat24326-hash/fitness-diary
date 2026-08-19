/**
 * Формат KPI удержания для UI (без React).
 */

/** @typedef {'good' | 'mid' | 'low' | 'none' | 'pending'} RetentionTone */

/**
 * @param {number|null|undefined} rate 0…1
 * @returns {string}
 */
export function formatRetentionRatePct(rate) {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${Math.round(rate * 100)}%`
}

/**
 * @param {number|null|undefined} rate 0…1
 * @returns {RetentionTone}
 */
export function retentionRateTone(rate) {
  if (rate == null || !Number.isFinite(rate)) return 'none'
  if (rate >= 0.7) return 'good'
  if (rate >= 0.45) return 'mid'
  return 'low'
}

/**
 * M+3 ещё нельзя считать: клиенты есть, зрелых когорт нет.
 * @param {{ retentionM3?: { averageRate?: number|null, cohortSize?: number }, tenureClientCount?: number }|null|undefined} row
 */
export function isTrainerM3Immature(row) {
  const rate = row?.retentionM3?.averageRate
  const cohortSize = row?.retentionM3?.cohortSize ?? 0
  const tenureCount = row?.tenureClientCount ?? 0
  return (rate == null || !Number.isFinite(rate)) && cohortSize === 0 && tenureCount > 0
}

/**
 * @param {{ retentionM3?: { averageRate?: number|null }, tenureClientCount?: number }|null|undefined} row
 * @returns {{ text: string, tone: RetentionTone }}
 */
export function formatTrainerM3Cell(row) {
  if (isTrainerM3Immature(row)) return { text: 'Рано', tone: 'pending' }
  const rate = row?.retentionM3?.averageRate
  return { text: formatRetentionRatePct(rate), tone: retentionRateTone(rate) }
}

/**
 * @param {number|null|undefined} days
 * @returns {string}
 */
export function formatTenureDays(days) {
  if (days == null || !Number.isFinite(days)) return '—'
  const n = Math.round(days)
  const mod10 = n % 10
  const mod100 = n % 100
  let word = 'дней'
  if (mod10 === 1 && mod100 !== 11) word = 'день'
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'дня'
  return `${n} ${word}`
}

/**
 * @param {object|null|undefined} mix
 * @returns {Array<{ label: string, count: number }>}
 */
export function topArchiveReasonRows(mix, limit = 5) {
  const byLabel = mix?.byLabel ?? {}
  return Object.entries(byLabel)
    .map(([label, count]) => ({ label, count: Number(count) || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
