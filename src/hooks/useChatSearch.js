import { useCallback, useEffect, useRef, useState } from 'react'
import { nextChatSearchIndex, normalizeChatSearchQuery } from '../lib/chat/chatSearchCore.js'
import { isAppOnline } from '../lib/networkReachability.js'

const TYPE_PAUSE_MS = 400
const CLOSED = { isOpen: false, query: '', results: null, index: 0, status: 'idle', error: '' }
export const CHAT_SEARCH_OFFLINE_RU = 'Нет сети — поиск недоступен'

/**
 * Поиск по диалогу, как в Telegram: ищем на сервере, пока человек печатает (пауза 400 мс), новые сверху;
 * сразу к самому свежему совпадению, ↑ — к более старому, ↓ — к более новому.
 * @param {{ search?: (q: string) => Promise<{ results: object[] }>, jump: (id: string) => Promise<boolean> }} p
 */
export function useChatSearch({ search, jump }) {
  const [state, setState] = useState(CLOSED)
  const timerRef = useRef(null)
  const reqRef = useRef(0)
  const jumpRef = useRef(jump)
  const stateRef = useRef(state)
  jumpRef.current = jump
  stateRef.current = state

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const run = useCallback(
    async (raw) => {
      const checked = normalizeChatSearchQuery(raw)
      const req = ++reqRef.current
      if (!checked.ok) {
        setState((s) => ({ ...s, results: null, status: 'idle', error: '' }))
        return
      }
      if (!isAppOnline()) {
        setState((s) => ({ ...s, results: null, status: 'error', error: CHAT_SEARCH_OFFLINE_RU }))
        return
      }
      setState((s) => ({ ...s, status: 'loading', error: '' }))
      try {
        const { results } = await search(checked.q)
        if (req !== reqRef.current) return
        const list = Array.isArray(results) ? results : []
        setState((s) => ({ ...s, results: list, index: 0, status: 'ready' }))
        if (list.length) void jumpRef.current(list[0].id)
      } catch (e) {
        if (req === reqRef.current) setState((s) => ({ ...s, results: null, status: 'error', error: e?.message || 'Не нашлось' }))
      }
    },
    [search],
  )

  const setQuery = useCallback(
    (query) => {
      setState((s) => ({ ...s, query }))
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void run(query), TYPE_PAUSE_MS)
    },
    [run],
  )

  /** Enter / ↑ — к более старому совпадению, ↓ — к более новому. */
  const step = useCallback((older) => {
    const s = stateRef.current
    const next = nextChatSearchIndex(s.index, s.results?.length ?? 0, older)
    if (next == null) return
    setState((cur) => ({ ...cur, index: next }))
    void jumpRef.current(s.results[next].id)
  }, [])

  const open = useCallback(() => setState({ ...CLOSED, isOpen: true }), [])
  const close = useCallback(() => {
    window.clearTimeout(timerRef.current)
    reqRef.current++
    setState(CLOSED)
  }, [])

  return { ...state, available: Boolean(search), open, close, setQuery, step }
}
