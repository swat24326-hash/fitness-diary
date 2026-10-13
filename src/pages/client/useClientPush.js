import { useCallback, useEffect, useState } from 'react'
import { usePushSelfHeal } from '../../hooks/usePushSelfHeal.js'
import { isIosUserAgent } from '../../lib/client/clientInstallCore.js'
import { healEndpointPush, setPushWantOn } from '../../lib/push/pushSelfHeal.js'
import { clientPushMode } from '../../lib/client/clientPushModeCore.js'
import { postClientMe } from '../../lib/client/clientSession.js'
import { isTrainerPushSupported, serializePushSubscription } from '../../lib/push/trainerPushCore.js'
import { formatPushSubscribeError, subscribePushManager } from '../../lib/push/trainerPushSubscribe.js'

function permissionNow() {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission
}

/**
 * Напоминания о тренировке на этот телефон. Браузерную подписку при выключении не снимаем:
 * service worker общий с приложением зала, снимаем только запись на сервере.
 * @param {{ active: boolean, standalone: boolean }} opts active — у клиента есть сессия
 */
export function useClientPush({ active, standalone }) {
  const [server, setServer] = useState({ ready: false, configured: false, publicKey: '', subscribed: false, endpoint: '' })
  const [permission, setPermission] = useState(permissionNow)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { status: st, endpoint } = await healEndpointPush('client', {
      fetchStatus: (e) => postClientMe({ action: 'push-status', endpoint: e }),
      subscribe: (p) => postClientMe({ action: 'push-subscribe', ...p }),
    })
    return { ready: true, configured: !!st.configured, publicKey: st.public_key || '', subscribed: !!st.subscribed, endpoint }
  }, [])

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    load()
      .then((next) => {
        if (cancelled) return
        setServer(next)
        setPermission(permissionNow())
      })
      .catch(() => {
        /* нет связи — карточку просто не показываем */
      })
    return () => {
      cancelled = true
    }
  }, [active, load])

  usePushSelfHeal('client', () => load().then(setServer), active, { onOpen: false })

  const enable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      // Safari спрашивает разрешение только прямо из касания — до любых других await.
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return false
      const ser = serializePushSubscription(await subscribePushManager(server.publicKey))
      if (!ser.ok) throw new Error(ser.error)
      await postClientMe({ action: 'push-subscribe', ...ser.payload })
      setPushWantOn('client', true)
      setServer((s) => ({ ...s, subscribed: true, endpoint: ser.payload.endpoint }))
      return true
    } catch (e) {
      setError(formatPushSubscribeError(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [server.publicKey])

  const disable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      await postClientMe({ action: 'push-unsubscribe', endpoint: server.endpoint })
      setPushWantOn('client', false)
      setServer((s) => ({ ...s, subscribed: false }))
    } catch (e) {
      setError(e?.message || 'Не получилось — попробуйте ещё раз')
    } finally {
      setBusy(false)
    }
  }, [server.endpoint])

  const mode = clientPushMode({
    configured: server.configured,
    supported: isTrainerPushSupported(),
    ios: isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints),
    standalone,
    permission,
    subscribed: server.subscribed,
  })
  return { mode, ready: server.ready, busy, error, enable, disable }
}
