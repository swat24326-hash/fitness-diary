import { useCallback, useState } from 'react'
import { useChatThread } from './useChatThread.js'
import { useStaffGroupPin } from './useStaffGroupPin.js'

/**
 * Лента чата клуба + «без звука» + закреп. api — staffGroupApi(clubId) планшета или coachGroupApi телефона (стабильный объект).
 * onMuteChange — после смены «без звука» (обновить число на конверте). cacheKey — кэш ленты (только телефон тренера).
 * @param {{ load: Function, send: Function, react: Function, search: Function, mute: (muted: boolean) => Promise<object>,
 *   pin: Function, readers: Function, voice: object }} api
 */
export function useStaffGroupThread(api, key, onMuteChange, cacheKey = '') {
  const load = useCallback((before, opts) => api.load(before, opts?.seen), [api])
  const chat = useChatThread({ key: `group:${key}`, side: 'staff', cacheKey, load, send: api.send, react: api.react, search: api.search, voice: api.voice })
  const pin = useStaffGroupPin(api, chat.meta)
  const [mutedLocal, setMutedLocal] = useState(null)
  const [muteError, setMuteError] = useState('')
  const muted = mutedLocal ?? Boolean(chat.meta?.muted)

  const toggleMute = useCallback(async () => {
    const next = !muted
    setMutedLocal(next)
    setMuteError('')
    try {
      await api.mute(next)
      onMuteChange?.()
    } catch (e) {
      setMutedLocal(!next)
      setMuteError(e?.message || 'Не получилось — проверьте интернет')
    }
  }, [api, muted, onMuteChange])

  return { chat, muted, toggleMute, muteError, pin, readers: api.readers }
}
