/** «Часто используемые» на устройстве (localStorage). Приватный режим — только до перезагрузки. */
import { parseEmojiUsage, recordEmojiUsage } from './chatEmojiFrequentCore.js'

const KEY = 'fd_chat_emoji_usage'
const LEGACY_RECENT_KEY = 'fd_chat_recent_emoji'

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

export function readEmojiUsage() {
  return parseEmojiUsage(readJson(KEY), readJson(LEGACY_RECENT_KEY))
}

/** @param {string | { sticker: string }} sent */
export function rememberSentEmoji(sent) {
  const next = recordEmojiUsage(readEmojiUsage(), sent)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    localStorage.removeItem(LEGACY_RECENT_KEY)
  } catch {
    /* приватный режим */
  }
}
