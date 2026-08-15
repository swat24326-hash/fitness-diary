import { clubOpsDayBoundsUtc } from '../dateRu.js'

/**
 * Фильтр строк журнала связи по календарному дню клуба (МСК).
 * @param {Array<{ created_at?: string }>} rows
 * @param {string} dayIso
 */
export function filterOutreachRowsByClubDay(rows, dayIso) {
  const { gte, lt } = clubOpsDayBoundsUtc(dayIso)
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const t = String(row?.created_at ?? '')
    return t && t >= gte && t < lt
  })
}
