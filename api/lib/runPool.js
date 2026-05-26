/**
 * Параллельная обработка с лимитом (для push-records на Vercel).
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function runPool(items, limit, fn) {
  if (!items.length) return []
  const out = new Array(items.length)
  const concurrency = Math.max(1, Math.min(limit, items.length))
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      out[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return out
}
