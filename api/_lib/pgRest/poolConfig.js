/** Размер пула к PG из env: при усилении сервера меняем число, не код (docs/CAPACITY_PLAN.md, этап C). */

export const PG_POOL_MAX_DEFAULT = 8
const PG_POOL_MAX_LIMIT = 40

/** @param {unknown} raw — process.env.PG_POOL_MAX */
export function pgPoolMaxFromEnv(raw) {
  const n = Number(String(raw ?? '').trim())
  if (!Number.isInteger(n) || n < 2) return PG_POOL_MAX_DEFAULT
  return Math.min(n, PG_POOL_MAX_LIMIT)
}
