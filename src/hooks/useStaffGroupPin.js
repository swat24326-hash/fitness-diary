import { useCallback, useState } from 'react'
import { isAppOnline } from '../lib/networkReachability.js'

const OFFLINE_RU = 'Нет сети — закрепить не получилось'

/**
 * Закреп чата клуба: ответ сервера показываем сразу, следующий опрос ленты приносит то же из базы.
 * @param {{ pin: (messageId: string|null) => Promise<{ pinned: object|null }> }} api
 * @param {object|null} meta chat.meta из useChatThread
 */
export function useStaffGroupPin(api, meta) {
  const [local, setLocal] = useState({ meta: undefined, pinned: null })
  const [error, setError] = useState('')
  const pinned = local.meta === meta ? local.pinned : (meta?.pinned ?? null)

  const setPin = useCallback(
    async (messageId) => {
      if (!isAppOnline()) {
        setError(OFFLINE_RU)
        return
      }
      setError('')
      try {
        const out = await api.pin(messageId)
        setLocal({ meta, pinned: out?.pinned ?? null })
      } catch (e) {
        setError(e?.message || OFFLINE_RU)
      }
    },
    [api, meta],
  )

  return { pinned, canPin: Boolean(meta?.can_pin), setPin, error }
}
