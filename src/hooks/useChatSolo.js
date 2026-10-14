import { useLayoutEffect } from 'react'

/** На <html>, пока на телефоне открыт диалог: шапка приложения прячется, остаётся только шапка диалога (как в Telegram). */
export const CHAT_SOLO_ATTR = 'data-chat-solo'

/** @param {boolean} active */
export function useChatSolo(active) {
  useLayoutEffect(() => {
    if (!active) return undefined
    const root = document.documentElement
    root.setAttribute(CHAT_SOLO_ATTR, '')
    return () => root.removeAttribute(CHAT_SOLO_ATTR)
  }, [active])
}
