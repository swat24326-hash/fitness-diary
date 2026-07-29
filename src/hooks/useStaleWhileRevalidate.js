/**
 * Stale-while-revalidate для home-glance: last-good сразу, сеть если TTL истёк.
 * Detail-экраны не используют этот хук для отказа от fetch.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * @param {object} opts
 * @param {boolean} [opts.enabled]
 * @param {unknown[]} [opts.deps] — смена ключа (клуб / период)
 * @param {() => unknown|null|undefined} opts.peek
 * @param {() => ({ payload: unknown, savedAt: number }|null|undefined)} [opts.read]
 * @param {(payload: unknown) => void} [opts.write]
 * @param {(savedAt: number) => boolean} opts.isFresh
 * @param {(a: unknown, b: unknown) => boolean} [opts.looksSame]
 * @param {() => Promise<unknown|null|undefined>} opts.fetcher
 */
export function useStaleWhileRevalidate({
  enabled = true,
  deps = [],
  peek,
  read,
  write,
  isFresh,
  looksSame = (a, b) => a === b,
  fetcher,
}) {
  const depsKey = JSON.stringify(deps)
  const [data, setData] = useState(() => {
    if (!enabled || typeof peek !== 'function') return null
    try {
      return peek() ?? null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(() => {
    if (!enabled) return false
    if (typeof peek !== 'function') return true
    try {
      return peek() == null
    } catch {
      return true
    }
  })
  const genRef = useRef(0)

  useLayoutEffect(() => {
    if (!enabled) return
    const cached = typeof peek === 'function' ? peek() : null
    if (cached == null) {
      setData(null)
      setLoading(true)
      return
    }
    setData((prev) => (looksSame(prev, cached) ? prev : cached))
    setLoading(false)
  }, [enabled, depsKey, peek, looksSame])

  const reload = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled) return
      const gen = ++genRef.current
      const row = typeof read === 'function' ? read() : null
      const cachedPayload = row?.payload ?? (typeof peek === 'function' ? peek() : null)

      if (cachedPayload != null) {
        setData((prev) => (looksSame(prev, cachedPayload) ? prev : cachedPayload))
        setLoading(false)
        if (!force && row?.savedAt != null && isFresh(row.savedAt)) return
      } else {
        setLoading(true)
      }

      try {
        const next = await fetcher()
        if (gen !== genRef.current) return
        if (next == null) {
          if (cachedPayload == null) setData(null)
          return
        }
        if (typeof write === 'function') write(next)
        setData((prev) => (looksSame(prev, next) ? prev : next))
      } catch {
        if (gen !== genRef.current) return
        if (cachedPayload == null) setData(null)
      } finally {
        if (gen === genRef.current) setLoading(false)
      }
    },
    [enabled, depsKey, peek, read, write, isFresh, looksSame, fetcher],
  )

  useEffect(() => {
    if (!enabled) return
    void reload()
    return () => {
      genRef.current += 1
    }
  }, [enabled, reload])

  return { data, setData, loading, reload }
}
