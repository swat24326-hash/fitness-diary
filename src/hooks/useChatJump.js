import { useCallback, useEffect, useRef, useState } from 'react'
import { jumpToChatMessage } from '../lib/chat/chatJumpToMessage.js'

/** Плавная прокрутка к сообщению сама может доехать до низа — это не «человек вернулся вниз». */
const JUMP_SCROLL_MS = 1200

/**
 * Переходы по ленте, как в Telegram: к исходному по цитате, к найденному поиском и обратно — «↓ к ответу».
 * Нет сообщения в загруженной ленте — find догружает историю, доедем, как только оно отрисуется.
 * @param {{ messages: object[]|null, find?: (id: string) => Promise<boolean> }} p
 */
export function useChatJump({ messages, find }) {
  const [finding, setFinding] = useState(null)
  /** Откуда прыгали по цитатам — «назад» возвращает по одному, последним вернётся первый прыжок. */
  const [backStack, setBackStack] = useState([])
  const seekRef = useRef(null)
  const jumpedAtRef = useRef(0)

  const scrollTo = useCallback((id) => {
    const done = jumpToChatMessage(id)
    if (done) jumpedAtRef.current = Date.now()
    return done
  }, [])

  useEffect(() => {
    if (seekRef.current && scrollTo(seekRef.current)) seekRef.current = null
  }, [messages, scrollTo])

  /** @returns {Promise<boolean>} доехали (или доедем после отрисовки) */
  const jump = useCallback(
    async (id, fromId) => {
      if (fromId) setBackStack((s) => (s.at(-1) === String(fromId) ? s : [...s, String(fromId)]))
      if (scrollTo(id)) return true
      if (!find || seekRef.current) return false
      seekRef.current = String(id)
      setFinding(String(id))
      jumpedAtRef.current = Date.now()
      const found = await find(id)
      setFinding(null)
      if (!found) seekRef.current = null
      return found
    },
    [find, scrollTo],
  )

  const back = useCallback(() => {
    const id = backStack.at(-1)
    if (!id) return
    setBackStack((s) => s.slice(0, -1))
    scrollTo(id)
  }, [backStack, scrollTo])

  /** Человек сам долистал до низа — возвращаться некуда. */
  const clearBack = useCallback(() => {
    if (Date.now() - jumpedAtRef.current < JUMP_SCROLL_MS) return
    setBackStack((s) => (s.length ? [] : s))
  }, [])

  return { jump, finding, canGoBack: backStack.length > 0, back, clearBack }
}
