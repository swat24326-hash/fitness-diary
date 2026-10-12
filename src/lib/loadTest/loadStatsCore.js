/**
 * Итог ступени нагрузочного теста (docs/CAPACITY_PLAN.md, этап B). Без сети и базы — считается в verify.
 * Пороги из зала: планшет обрывает pull через 45 с (SYNC_PULL_FETCH_TIMEOUT_MS), Sync дольше 15 с тренер уже замечает.
 */
import { SYNC_PULL_FETCH_TIMEOUT_MS } from '../networkReachability.js'

export const LOAD_SLOW_P95_MS = 15_000
export const LOAD_MAX_ERROR_SHARE = 0.01

/** @param {number[]} sorted @param {number} q */
export function percentile(sorted, q) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]
}

/**
 * @param {{ ms: number, status: number, bytes: number }[]} results status 0 — сеть / таймаут клиента
 * @param {number} wallMs
 */
export function summarizeLoadStep(results, wallMs) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b)
  const errors = results.filter((r) => r.status !== 200 || r.ms >= SYNC_PULL_FETCH_TIMEOUT_MS)
  const byStatus = {}
  for (const r of errors) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  const bytes = results.reduce((s, r) => s + (r.status === 200 ? r.bytes : 0), 0)
  return {
    n: results.length,
    errors: errors.length,
    byStatus,
    p50: percentile(ms, 0.5),
    p95: percentile(ms, 0.95),
    max: ms[ms.length - 1] ?? 0,
    avgKb: results.length ? Math.round(bytes / 1024 / Math.max(1, results.length - errors.length)) : 0,
    wallMs,
  }
}

/** @returns {'ok' | 'slow' | 'broken'} */
export function loadStepVerdict(s) {
  if (s.n && s.errors / s.n > LOAD_MAX_ERROR_SHARE) return 'broken'
  if (s.p95 > LOAD_SLOW_P95_MS) return 'slow'
  return 'ok'
}

export function formatLoadStep(label, s) {
  const err = s.errors ? ` ошибок ${s.errors} (${Object.entries(s.byStatus).map(([k, v]) => `${k === '0' ? 'сеть/таймаут' : k}×${v}`).join(', ')})` : ''
  const sec = (x) => (x / 1000).toFixed(1)
  return `${label}: ${s.n} разом — p50 ${sec(s.p50)} с, p95 ${sec(s.p95)} с, max ${sec(s.max)} с, ответ ~${s.avgKb} КБ, вся ступень ${sec(s.wallMs)} с${err} → ${loadStepVerdict(s)}`
}
