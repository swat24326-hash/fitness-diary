import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { clientPlanMarkText } from '../../lib/clientPlans/clientPlanCore.js'
import { LOCAL_DATA_CHANGED } from '../../lib/localDataEvents.js'
import { latestClientPlanMark, sendClientPlanToApp } from '../../lib/clientPlans/clientPlanSendService.js'

/**
 * Кнопка «В приложение» на экранах ДЗ и рациона: отправка + подпись «Отправлено / Клиент открыл».
 * Отправляют тренер клиента и главный админ (сервер проверяет то же в authorizePush).
 * @param {'homework'|'nutrition'} kind
 */
export function useClientPlanSend(kind, client, readOnly = false) {
  const { user, isAdmin, isTrainer } = useAuth()
  const clientId = String(client?.id ?? '')
  const [mark, setMark] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      setMark(await latestClientPlanMark(clientId, kind))
    } catch {
      setMark(null)
    }
  }, [clientId, kind])

  useEffect(() => {
    setError('')
    void reload()
    window.addEventListener(LOCAL_DATA_CHANGED, reload)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, reload)
  }, [reload])

  /** @param {() => ({ ok: true, payload: object } | { ok: false, error: string })} build */
  const send = useCallback(
    async (build) => {
      setError('')
      const snap = build()
      if (!snap.ok) {
        setError(snap.message || 'Нечего отправить')
        return false
      }
      setBusy(true)
      try {
        setMark(await sendClientPlanToApp({ kind, client, payload: snap.payload, userId: user?.id }))
        return true
      } catch (e) {
        setError(e?.message || 'Не удалось сохранить отправку')
        return false
      } finally {
        setBusy(false)
      }
    },
    [kind, client, user?.id],
  )

  return {
    canSend: Boolean(!readOnly && client?.id && user?.id && (isAdmin || isTrainer) && !client?.archived_at),
    busy,
    status: error || clientPlanMarkText(mark),
    isError: Boolean(error),
    send,
  }
}
