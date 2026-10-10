import { CHAT_SOUND_STORAGE_KEY, isChatSoundEnabled } from './chatSoundCore.js'

export const CHAT_SOUND_CHANGED = 'fd:chat-sound-changed'

function readStored() {
  try {
    return window.localStorage.getItem(CHAT_SOUND_STORAGE_KEY)
  } catch {
    return null
  }
}

/** @param {'client' | 'staff'} side */
export function readChatSoundEnabled(side) {
  return isChatSoundEnabled(readStored(), side)
}

/** @param {boolean} on */
export function writeChatSoundEnabled(on) {
  try {
    window.localStorage.setItem(CHAT_SOUND_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* приватный режим — переключатель живёт до перезагрузки */
  }
  window.dispatchEvent(new Event(CHAT_SOUND_CHANGED))
}
