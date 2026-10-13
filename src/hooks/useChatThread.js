import { useCallback, useEffect, useRef, useState } from 'react'
import { nextChatOutgoingId } from '../lib/chat/chatDeliveryCore.js'
import { mergeChatMessages } from '../lib/chat/chatMessageCore.js'
import { CHAT_REACTION_OFFLINE_RU, patchChatReactions, toggleChatReaction } from '../lib/chat/chatReactionCore.js'
import { CHAT_REPLY_NOT_FOUND_RU, buildChatReplyQuote, loadChatHistoryUntil } from '../lib/chat/chatReplyCore.js'
import { chatSeenNeedsRefresh } from '../lib/chat/chatSeenCore.js'
import { countNewPeerMessages } from '../lib/chat/chatSoundCore.js'
import { armChatSound, playChatSound } from '../lib/chat/chatSoundPlayer.js'
import { isAppOnline } from '../lib/networkReachability.js'
import { onPushReceived } from '../lib/push/pushReceivedSignal.js'

const POLL_MS = 10_000
export const CHAT_OFFLINE_RU = 'Нет сети — сообщение не отправлено'

/**
 * Лента одного диалога — общая для клиента и сотрудника. Только онлайн: очередь sync не трогаем.
 * Пока экран открыт и виден — свежие сообщения раз в 10 с и сразу при приходе push.
 * Читает историю выше — опрос без отметки «прочитано» (seen=false); дошёл до низа — перечитываем с отметкой.
 * react(messageId, emoji|null) — реакция на сообщение; на экране сразу, ответ сервера уточняет.
 * search(q) — поиск по диалогу на сервере ({ results }); отдаём как есть в ChatThreadView.
 * @param {{ key: string, side: 'client' | 'staff', load: (before?: string, opts?: { seen: boolean }) => Promise<{ messages: object[], has_more: boolean }>, send: (outgoing: { body: string } | { sticker: string }) => Promise<{ message: object }>, react?: (messageId: string, emoji: string|null) => Promise<{ reactions: object[] }> }} p
 */
export function useChatThread({ key, side, load, send, react, search }) {
  const [state, setState] = useState({ messages: null, meta: null, hasMore: false, status: 'loading', error: '', errorStatus: null })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const replyRef = useRef(null)
  const loadRef = useRef(load)
  const sendRef = useRef(send)
  const reactRef = useRef(react)
  const messagesRef = useRef(null)
  const keyRef = useRef(key)
  const pendingRef = useRef(null)
  const seenRef = useRef(true)
  const stateMetaRef = useRef(null)
  const hasMoreRef = useRef(false)
  loadRef.current = load
  sendRef.current = send
  reactRef.current = react
  messagesRef.current = state.messages
  keyRef.current = key
  replyRef.current = replyTo
  stateMetaRef.current = state.meta
  hasMoreRef.current = state.hasMore

  const refresh = useCallback((quiet) => {
    if (!quiet) setState((s) => ({ ...s, status: 'loading', error: '', errorStatus: null }))
    const forKey = keyRef.current
    return loadRef
      .current(undefined, { seen: seenRef.current })
      .then(({ messages, has_more, ...meta }) => {
        if (keyRef.current !== forKey) return
        if (quiet && countNewPeerMessages(messagesRef.current, messages) > 0) playChatSound('incoming', side)
        setState((s) => ({
          messages: mergeChatMessages(s.messages, messages),
          meta,
          hasMore: s.messages ? s.hasMore : has_more,
          status: 'ready',
          error: '',
          errorStatus: null,
        }))
      })
      .catch((e) => {
        if (!quiet && keyRef.current === forKey) {
          setState((s) => ({ ...s, status: 'error', error: e?.message || 'Не загрузилось', errorStatus: e?.status ?? null }))
        }
      })
  }, [side])

  /** Лента сообщает, внизу ли человек (ChatThreadView). */
  const onAtBottom = useCallback(
    (atBottom) => {
      const was = seenRef.current
      seenRef.current = atBottom
      if (chatSeenNeedsRefresh(was, atBottom) && document.visibilityState === 'visible' && isAppOnline()) void refresh(true)
    },
    [refresh],
  )

  useEffect(() => armChatSound(side), [side])

  useEffect(() => {
    messagesRef.current = null
    seenRef.current = true
    setReplyTo(null)
    setState({ messages: null, meta: null, hasMore: false, status: 'loading', error: '', errorStatus: null })
    void refresh(false)
    const tick = () => document.visibilityState === 'visible' && isAppOnline() && void refresh(true)
    const t = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    const offPush = onPushReceived(tick)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
      offPush()
    }
  }, [key, refresh])

  const loadOlder = useCallback(async () => {
    const first = state.messages?.[0]
    if (!first) return
    const forKey = keyRef.current
    try {
      const { messages, has_more } = await loadRef.current(first.created_at)
      if (keyRef.current !== forKey) return
      setState((s) => ({ ...s, messages: mergeChatMessages(s.messages, messages), hasMore: has_more }))
    } catch (e) {
      if (keyRef.current === forKey) setState((s) => ({ ...s, error: e?.message || 'Не загрузилось' }))
    }
  }, [state.messages])

  /**
   * @param {string | { sticker: string }} input текст из поля или стикер
   * @returns {Promise<boolean>} true — отправлено, поле можно очистить
   */
  const submit = useCallback(async (input) => {
    if (!isAppOnline()) {
      setSendError(CHAT_OFFLINE_RU)
      return false
    }
    setSending(true)
    setSendError('')
    const forKey = keyRef.current
    const quote = replyRef.current
    const outgoing = typeof input === 'string' ? { body: input } : input
    pendingRef.current = nextChatOutgoingId(pendingRef.current, forKey, outgoing)
    try {
      const { message } = await sendRef.current({ ...outgoing, client_msg_id: pendingRef.current.id, ...(quote ? { reply_to: quote.id } : {}) })
      pendingRef.current = null
      if (keyRef.current === forKey) {
        setState((s) => ({ ...s, messages: mergeChatMessages(s.messages, [message]) }))
        setReplyTo((r) => (r === quote ? null : r))
      }
      playChatSound('send', side)
      return true
    } catch (e) {
      setSendError(e?.message || CHAT_OFFLINE_RU)
      return false
    } finally {
      setSending(false)
    }
  }, [side])

  /** Нажали смайлик в меню или плашку под сообщением: поставить, заменить или снять свою реакцию. */
  const reactTo = useCallback(async (messageId, tapped) => {
    if (!isAppOnline()) {
      setSendError(CHAT_REACTION_OFFLINE_RU)
      return
    }
    const forKey = keyRef.current
    const was = messagesRef.current?.find((m) => String(m.id) === String(messageId))?.reactions ?? []
    const next = toggleChatReaction(was, tapped)
    const show = (reactions) => {
      if (keyRef.current === forKey) setState((s) => ({ ...s, messages: patchChatReactions(s.messages, messageId, reactions) }))
    }
    show(next.reactions)
    setSendError('')
    try {
      const out = await reactRef.current(messageId, next.emoji)
      show(Array.isArray(out?.reactions) ? out.reactions : next.reactions)
    } catch (e) {
      show(was)
      setSendError(e?.message || CHAT_REACTION_OFFLINE_RU)
    }
  }, [])

  /** «Ответить»: цитата над полем ввода; имя собеседника — для сообщений без своего author_name. */
  const startReply = useCallback((message) => {
    const meta = stateMetaRef.current
    setReplyTo(buildChatReplyQuote(message, meta?.client?.name || meta?.peer?.name || ''))
  }, [])
  const cancelReply = useCallback(() => setReplyTo(null), [])

  /** Цитата старого сообщения: догрузить историю до него. true — оно в ленте, можно ехать к нему. */
  const findMessage = useCallback(async (id) => {
    const forKey = keyRef.current
    try {
      const out = await loadChatHistoryUntil({
        id,
        messages: messagesRef.current,
        hasMore: hasMoreRef.current,
        loadOlder: (before) => loadRef.current(before),
      })
      if (keyRef.current !== forKey) return false
      setState((s) => ({ ...s, messages: mergeChatMessages(s.messages, out.messages), hasMore: out.hasMore }))
      if (!out.found) setSendError(CHAT_REPLY_NOT_FOUND_RU)
      return out.found
    } catch (e) {
      if (keyRef.current === forKey) setSendError(e?.message || 'Не загрузилось')
      return false
    }
  }, [])

  return {
    ...state,
    reload: () => refresh(false),
    loadOlder,
    submit,
    react: react ? reactTo : undefined,
    reply: { to: replyTo, start: startReply, cancel: cancelReply, find: findMessage },
    search,
    sending,
    sendError,
    onAtBottom,
  }
}
