/**
 * Метрика скорости тяжёлых запросов на ВМ (journalctl): время и размер успешных ответов.
 * Нужна до любой оптимизации Sync / статистики — правило «оптимизация только с метрикой».
 * Без тел, токенов и query, кроме `action` у admin-data (имя ветки, не данные).
 */

const TIMED_PATHS = new Set([
  '/api/trainer-pull',
  '/api/push-record',
  '/api/push-records',
  '/api/admin-data',
  '/api/get-client',
  '/api/list-clients',
  '/api/list-memberships',
])
const ACTION_RE = /^[a-z0-9_-]{1,40}$/i
const LINE_RE = /\[api-timing\] (\S+) (\S+) (\d{3}) (\d+)ms (\d+)KB/

/** @param {string} pathname @param {number} status */
export function shouldLogPortableTiming(pathname, status) {
  const code = Number(status) || 0
  return code >= 200 && code < 400 && TIMED_PATHS.has(String(pathname ?? ''))
}

/** @param {string} pathname @param {string} search  `?action=club-stats&…` */
export function timingRouteLabel(pathname, search) {
  if (pathname !== '/api/admin-data') return pathname
  const action = new URLSearchParams(String(search ?? '')).get('action') ?? ''
  return ACTION_RE.test(action) ? `${pathname}:${action}` : pathname
}

/**
 * @param {{ method?: string, route: string, status: number, ms: number, bytes: number, userId?: string | null }} row
 */
export function formatPortableTimingLog(row) {
  const user = row.userId ? ` user=${row.userId}` : ''
  const kb = Math.round((Number(row.bytes) || 0) / 1024)
  return `[api-timing] ${row.method || 'GET'} ${row.route} ${row.status} ${Math.round(row.ms)}ms ${kb}KB${user}`
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]

/**
 * Строки журнала → по маршруту: число, p50 / p95 / max мс, средний и максимальный размер.
 * @param {string[]} lines
 */
export function summarizeTimingLines(lines) {
  /** @type {Map<string, { ms: number[], kb: number[] }>} */
  const by = new Map()
  for (const line of lines) {
    const m = LINE_RE.exec(String(line))
    if (!m) continue
    const key = `${m[1]} ${m[2]}`
    const row = by.get(key) ?? { ms: [], kb: [] }
    row.ms.push(Number(m[4]))
    row.kb.push(Number(m[5]))
    by.set(key, row)
  }
  return [...by.entries()]
    .map(([route, { ms, kb }]) => {
      const s = [...ms].sort((a, b) => a - b)
      return {
        route,
        count: s.length,
        p50: pct(s, 50),
        p95: pct(s, 95),
        max: s[s.length - 1],
        avgKb: Math.round(kb.reduce((a, b) => a + b, 0) / kb.length),
        maxKb: Math.max(...kb),
      }
    })
    .sort((a, b) => b.p95 - a.p95)
}
