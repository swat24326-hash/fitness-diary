/**
 * Параллельная обработка с ограничением числа одновременных задач.
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<void>} fn
 */
export async function mapWithConcurrency(items, concurrency, fn) {
  if (!items.length) return
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
}
