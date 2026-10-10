import { useCallback, useEffect, useState } from 'react'
import { CHAT_SOUND_CHANGED, readChatSoundEnabled, writeChatSoundEnabled } from '../lib/chat/chatSoundSetting.js'

/** Переключатель «Звуки сообщений» на этом устройстве. @param {'client' | 'staff'} side */
export function useChatSoundSetting(side) {
  const [on, setOn] = useState(() => readChatSoundEnabled(side))
  useEffect(() => {
    const sync = () => setOn(readChatSoundEnabled(side))
    window.addEventListener(CHAT_SOUND_CHANGED, sync)
    return () => window.removeEventListener(CHAT_SOUND_CHANGED, sync)
  }, [side])
  const toggle = useCallback(() => writeChatSoundEnabled(!readChatSoundEnabled(side)), [side])
  return { on, toggle }
}
