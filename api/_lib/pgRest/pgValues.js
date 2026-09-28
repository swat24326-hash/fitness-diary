/** Строка timestamptz от node-pg (`… +00`) → ISO. Дата без времени сюда не приходит. */
export function pgTimestamptzToIso(value) {
  if (value == null || value === '') return value
  let raw = String(value).trim()
  if (!raw.includes('T')) raw = raw.replace(' ', 'T')
  raw = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  raw = raw.replace(/([+-]\d{2})$/, '$1:00')
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toISOString()
}

/** numeric/int8: число, если оно точно влезает в JS; иначе строка как есть. */
export function pgNumberMaybe(value) {
  if (value == null || value === '') return value
  if (typeof value === 'number') return value
  const raw = String(value)
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return value
  const n = Number(raw)
  if (!Number.isFinite(n)) return value
  if (!raw.includes('.') && Math.abs(n) > Number.MAX_SAFE_INTEGER) return raw
  return n
}
