/**
 * Что не так на планшете — по снимку состояния (без React и IndexedDB, проверка: scripts/verify-device-health.mjs).
 * Загрузка с сервера идёт по Sync и при открытии списка, а не по таймеру: «давно не грузил» ≠ сбой,
 * поэтому pull_failing — только серия неудачных попыток без успеха между ними.
 */
import { isQueueAuthStuck } from '../syncAuthStuck.js'
import { normalizeDeviceHealthCodes } from './deviceHealthCatalog.js'

export const QUEUE_STUCK_MS = 30 * 60_000
export const PULL_FAILING_MS = 30 * 60_000
export const PULL_FAILING_MIN_ATTEMPTS = 2
export const BUILD_STALE_MS = 3 * 60 * 60_000

/**
 * @param {{
 *   now: number,
 *   online: boolean,
 *   dbBlocked?: boolean,
 *   queue?: Array<{ created_at?: number, retry_count?: number, last_error?: string }> | null,
 *   pull?: { failSince?: number | null, failCount?: number } | null,
 *   buildStaleSince?: number | null,
 * }} s queue = null — очередь не прочитать (база заблокирована)
 * @returns {string[]}
 */
export function collectDeviceProblems(s) {
  const out = []
  if (s.dbBlocked) out.push('db_blocked')
  const queue = Array.isArray(s.queue) ? s.queue : []
  if (s.online && queue.length) {
    if (isQueueAuthStuck(queue)) out.push('auth_stuck')
    else if (queue.some((q) => Number(q.retry_count) > 0 && s.now - Number(q.created_at) > QUEUE_STUCK_MS)) out.push('queue_stuck')
  }
  const failSince = Number(s.pull?.failSince)
  if (s.online && failSince > 0 && Number(s.pull?.failCount) >= PULL_FAILING_MIN_ATTEMPTS && s.now - failSince > PULL_FAILING_MS) {
    out.push('pull_failing')
  }
  const staleSince = Number(s.buildStaleSince)
  if (staleSince > 0 && s.now - staleSince > BUILD_STALE_MS) out.push('build_stale')
  return normalizeDeviceHealthCodes(out)
}

/** Учёт попыток загрузки: успех сбрасывает серию, первая неудача её открывает. */
export function nextPullMark(prev, ok, now) {
  if (ok) return { okAt: now, failSince: null, failCount: 0 }
  const p = prev ?? {}
  return { okAt: p.okAt ?? null, failSince: p.failSince ?? now, failCount: Number(p.failCount ?? 0) + 1 }
}

/** Отпечаток для «отчёт изменился» — порядок кодов уже нормализован. */
export function deviceReportKey(problems, bundleId) {
  return `${(problems ?? []).join(',')}|${bundleId ?? ''}`
}
