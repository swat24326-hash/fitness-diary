export function formatDateRu(isoLike) {
  if (!isoLike) return '—'
  const s = String(isoLike)
  const parts = s.slice(0, 10).split('-')
  if (parts.length !== 3) return s
  const [y, m, d] = parts
  if (!y || !m || !d) return s
  return `${d}.${m}.${y}`
}

export function formatDateTimeRu(isoLike) {
  if (!isoLike) return '—'
  const s = String(isoLike)
  // Expected ISO: 2026-04-28T20:11:00.000Z
  const date = formatDateRu(s)
  const timeMatch = s.match(/T(\d{2}):(\d{2})/)
  if (!timeMatch) return date
  const hh = timeMatch[1]
  const mm = timeMatch[2]
  return `${hh}:${mm} ${date}`
}

