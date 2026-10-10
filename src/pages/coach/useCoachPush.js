import { useCallback, useEffect, useState } from 'react'
import { fetchCoachPushStatus, subscribeCoachPush, unsubscribeCoachPush } from '../../lib/coach/coachApiClient.js'
import { CoachSessionGoneError } from '../../lib/coach/coachSession.js'
import { isIosUserAgent } from '../../lib/client/clientInstallCore.js'
import { clientPushMode } from '../../lib/client/clientPushModeCore.js'
import { isTrainerPushSupported, serializePushSubscription } from '../../lib/push/trainerPushCore.js'
import { formatPushSubscribeError, subscribePushManager } from '../../lib/push/trainerPushSubscribe.js'
import { useCoachApp } from './CoachAppContext.jsx'

function permissionNow() {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || window.navigator.standalone === true
}

async function currentEndpoint() {
  if (!isTrainerPushSupported()) return ''
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return sub?.endpoint ?? ''
}

/**
 * Уведомления о сообщениях клиентов на этот телефон. Service worker общий с приложением зала,
 * поэтому при выключении снимаем только запись на сервере.
 */
export function useCoachPush() {
  const { onSessionGone } = useCoachApp()
  const [server, setServer] = useState({ ready: false, configured: false, publicKey: '', subscribed: false, endpoint: '' })
  const [permission, setPermission] = useState(permissionNow)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const fail = useCallback(
    (e) => {
      if (e instanceof CoachSessionGoneError) onSessionGone(e.message)
      else setError(formatPushSubscribeError(e))
    },
    [onSessionGone],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const endpoint = await currentEndpoint().catch(() => '')
      const st = await fetchCoachPushStatus(endpoint)
      if (cancelled) return
      setServer({ ready: true, configured: !!st.configured, publicKey: st.public_key || '', subscribed: !!st.subscribed, endpoint })
      setPermission(permissionNow())
    })().catch((e) => {
      if (e instanceof CoachSessionGoneError) onSessionGone(e.message)
    })
    return () => {
      cancelled = true
    }
  }, [onSessionGone])

  const enable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      // Safari спрашивает разрешение только прямо из касания — до любых других await.
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return
      const ser = serializePushSubscription(await subscribePushManager(server.publicKey))
      if (!ser.ok) throw new Error(ser.error)
      await subscribeCoachPush(ser.payload)
      setServer((s) => ({ ...s, subscribed: true, endpoint: ser.payload.endpoint }))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }, [server.publicKey, fail])

  const disable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      await unsubscribeCoachPush(server.endpoint)
      setServer((s) => ({ ...s, subscribed: false }))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }, [server.endpoint, fail])

  const mode = clientPushMode({
    configured: server.configured,
    supported: isTrainerPushSupported(),
    ios: isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints),
    standalone: isStandalone(),
    permission,
    subscribed: server.subscribed,
  })
  return { mode, ready: server.ready, busy, error, enable, disable }
}
