/**
 * Fetch с таймаутом для serverless API → Supabase.
 * Без этого handler может висеть до лимита Vercel, хотя Supabase уже недоступен.
 */

export function createFetchWithTimeout(defaultMs = 8000) {
  return async function fetchWithTimeout(input, init = {}) {
    const ms = init.timeoutMs ?? defaultMs
    const controller = new AbortController()
    const outerSignal = init.signal
    if (outerSignal?.aborted) {
      controller.abort(outerSignal.reason)
    } else if (outerSignal) {
      outerSignal.addEventListener('abort', () => controller.abort(outerSignal.reason), { once: true })
    }
    const timer = setTimeout(() => controller.abort(new Error('timeout')), ms)
    try {
      const { timeoutMs: _drop, ...rest } = init
      return await fetch(input, { ...rest, signal: controller.signal })
    } catch (e) {
      if (e?.name === 'AbortError' || /timeout/i.test(String(e?.message ?? ''))) {
        throw new Error('timeout')
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms]
 * @param {string} [label]
 */
export async function withServerTimeout(promise, ms = 8000, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout`)), ms)
    }),
  ])
}

export function isServerTimeoutError(err) {
  return /timeout/i.test(String(err?.message ?? err ?? ''))
}
