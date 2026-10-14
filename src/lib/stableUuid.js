const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v) => UUID_RE.test(String(v ?? ''))

function fnv(s, salt) {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Постоянный UUID из строки: одна строка на клиента — без дублей между устройствами и запусками cron. */
export function stableUuid(text) {
  const s = String(text ?? '')
  const hex = [0x9e37, 0x85eb, 0xc2b2, 0x27d4].map((salt) => fnv(s, salt).toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
