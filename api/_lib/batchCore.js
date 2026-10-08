/**
 * Пачки для массовых задач (рассылки, напоминания): длинный `IN (...)` режем на части,
 * отправку ведём в несколько потоков, чтобы 10 тыс. получателей не заняли весь пул и вечер.
 */

export const IN_CHUNK = 400

/**
 * @template T
 * @param {unknown[]} ids
 * @param {(part: unknown[]) => Promise<T[]>} load
 * @param {number} [size]
 * @returns {Promise<T[]>}
 */
export async function loadInChunks(ids, load, size = IN_CHUNK) {
  const out = []
  for (let i = 0; i < ids.length; i += size) out.push(...(await load(ids.slice(i, i + size))))
  return out
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} fn
 */
export async function runWithConcurrency(items, limit, fn) {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
}
