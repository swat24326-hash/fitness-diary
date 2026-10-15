import { useEffect } from 'react'
import { chatCacheSnapshot } from '../lib/screenCache/screenCacheCore.js'
import { peekScreenCache, readScreenCache, writeScreenCache } from '../lib/screenCache/screenCacheStore.js'

const EMPTY = { messages: null, meta: null, hasMore: false, status: 'loading', error: '', errorStatus: null }

/** Начальное состояние ленты: уже показанное в этой вкладке — сразу, без крутилки. @param {string} cacheKey */
export function chatThreadInitialState(cacheKey) {
  const snap = cacheKey ? peekScreenCache(cacheKey) : null
  return snap ? { ...EMPTY, messages: snap.messages, meta: snap.meta, hasMore: snap.hasMore } : EMPTY
}

/**
 * Кэш ленты useChatThread: до первого ответа сервера — сохранённое на телефоне (IndexedDB),
 * после — сохраняем последние сообщения (одинаковое хранилище не переписывает).
 * @param {{ cacheKey: string, key: string, keyRef: { current: string }, freshRef: { current: boolean },
 *   state: { messages: object[] | null, meta: object | null, hasMore: boolean }, setState: Function }} p
 */
export function useChatThreadCache({ cacheKey, key, keyRef, freshRef, state, setState }) {
  useEffect(() => {
    if (!cacheKey) return undefined
    let alive = true
    void readScreenCache(cacheKey).then((snap) => {
      if (!alive || !snap || freshRef.current || keyRef.current !== key) return
      setState((s) => (s.messages ? s : { ...s, messages: snap.messages, meta: snap.meta, hasMore: snap.hasMore }))
    })
    return () => {
      alive = false
    }
  }, [cacheKey, key, keyRef, freshRef, setState])

  useEffect(() => {
    if (!cacheKey || !freshRef.current || !state.messages) return
    void writeScreenCache(cacheKey, chatCacheSnapshot(state.messages, state.hasMore, state.meta))
  }, [cacheKey, freshRef, state.messages, state.hasMore, state.meta])
}
