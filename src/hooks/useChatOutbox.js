import { useCallback, useEffect, useRef, useState } from 'react'
import { chatOutboxAdd, chatOutboxDrop, chatSendRetryable } from '../lib/chat/chatOutboxCore.js'
import { isAppOnline } from '../lib/networkReachability.js'
import { peekScreenCache, readScreenCache, writeScreenCache } from '../lib/screenCache/screenCacheStore.js'

const RETRY_MS = 5_000
/** Без cacheKey: ушли в другой диалог и вернулись — часики на месте (до перезагрузки вкладки). */
const memoryOutbox = new Map()

const peek = (storeKey, key) => (storeKey ? peekScreenCache(storeKey) : memoryOutbox.get(key)) ?? []

/**
 * Очередь «ждут сети» одного диалога. С cacheKey (клиент, телефон тренера) — лежит в кэше экранов рядом с лентой:
 * закрыли приложение без сети — при следующем открытии диалога уйдёт само; «Выйти» и 7 дней — стирается вместе с кэшем.
 * Без cacheKey (планшет) — в памяти вкладки; уходит, пока открыт этот диалог.
 * Отправка строго по порядку, по одному; оборвалось — ждём сети и повторяем с того же сообщения.
 * @param {{ key: string, cacheKey: string, sendRef: { current: (payload: object) => Promise<{ message: object }> },
 *   onSent: (message: object, forKey: string) => void, onRejected: (error: string) => void }} p
 */
export function useChatOutbox({ key, cacheKey, sendRef, onSent, onRejected }) {
  const storeKey = cacheKey ? `${cacheKey}:outbox` : ''
  const [list, setList] = useState(() => peek(storeKey, key))
  const listRef = useRef(list)
  const busyRef = useRef(false)
  const keyRef = useRef(key)
  const cbRef = useRef({ onSent, onRejected })
  keyRef.current = key
  cbRef.current = { onSent, onRejected }

  const update = useCallback(
    (fn) => {
      const next = fn(listRef.current)
      listRef.current = next
      setList(next)
      if (storeKey) void writeScreenCache(storeKey, next)
      else if (next.length) memoryOutbox.set(keyRef.current, next)
      else memoryOutbox.delete(keyRef.current)
    },
    [storeKey],
  )

  const flush = useCallback(async () => {
    if (busyRef.current || !listRef.current.length || !isAppOnline()) return
    busyRef.current = true
    const forKey = keyRef.current
    try {
      while (listRef.current.length && keyRef.current === forKey) {
        const entry = listRef.current[0]
        try {
          const { message } = await sendRef.current(entry.payload)
          if (keyRef.current !== forKey) return
          update((l) => chatOutboxDrop(l, entry.id))
          cbRef.current.onSent(message, forKey)
        } catch (e) {
          if (chatSendRetryable(e) || keyRef.current !== forKey) return
          update((l) => chatOutboxDrop(l, entry.id))
          cbRef.current.onRejected(e?.message || 'Сообщение не отправлено')
        }
      }
    } finally {
      busyRef.current = false
    }
  }, [sendRef, update])

  useEffect(() => {
    let alive = true
    const hot = peek(storeKey, key)
    listRef.current = hot
    setList(hot)
    if (storeKey && !hot.length) {
      void readScreenCache(storeKey).then((saved) => {
        if (!alive || !Array.isArray(saved) || !saved.length || listRef.current.length) return
        listRef.current = saved
        setList(saved)
        void flush()
      })
    }
    void flush()
    return () => {
      alive = false
    }
  }, [storeKey, key, flush])

  const pending = list.length > 0
  useEffect(() => {
    if (!pending) return undefined
    const go = () => void flush()
    const t = window.setInterval(go, RETRY_MS)
    window.addEventListener('online', go)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('online', go)
    }
  }, [pending, flush])

  const enqueue = useCallback(
    (entry) => {
      update((l) => chatOutboxAdd(l, entry))
      void flush()
    },
    [update, flush],
  )

  return { list, enqueue }
}
