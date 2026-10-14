import { useCallback, useEffect, useState } from 'react'
import { fetchDeviceHealth, resolveDeviceHealth } from '../lib/admin/deviceHealthService.js'
import { onPushReceived } from '../lib/push/pushReceivedSignal.js'

const POLL_MS = 2 * 60_000
const CHANGED = 'fitness-diary-device-health-admin-changed'

/** Перезагрузка по таймеру, при возврате на вкладку, по push «device-health-…» и после «Решено». */
function useAutoReload(load, enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const onVisible = () => document.visibilityState === 'visible' && load()
    load()
    const t = window.setInterval(load, POLL_MS)
    window.addEventListener(CHANGED, load)
    document.addEventListener('visibilitychange', onVisible)
    const offPush = onPushReceived((msg) => {
      if (String(msg?.tag ?? '').startsWith('device-health-')) load()
    })
    return () => {
      window.clearInterval(t)
      window.removeEventListener(CHANGED, load)
      document.removeEventListener('visibilitychange', onVisible)
      offPush()
    }
  }, [load, enabled])
}

/** Иконка «Сбои» в шапке админа: сколько устройств ждут внимания и есть ли критичные. */
export function useDeviceHealthCount(enabled) {
  const [state, setState] = useState({ attention: 0, critical: false })
  const load = useCallback(() => {
    fetchDeviceHealth()
      .then(({ devices }) => {
        const need = devices.filter((d) => d.needs_attention)
        setState({ attention: need.length, critical: need.some((d) => d.critical) })
      })
      .catch(() => {
        /* нет сети — оставляем последнее число */
      })
  }, [])
  useAutoReload(load, enabled)
  return state
}

/** Страница /admin/health: список устройств и «Решено». */
export function useDeviceHealthList() {
  const [devices, setDevices] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const load = useCallback(() => {
    fetchDeviceHealth()
      .then((r) => {
        setDevices(r.devices)
        setError('')
      })
      .catch((e) => setError(String(e?.message ?? e)))
  }, [])
  useAutoReload(load, true)

  const resolve = useCallback(async (id) => {
    setBusyId(id)
    try {
      await resolveDeviceHealth(id)
      window.dispatchEvent(new Event(CHANGED))
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setBusyId('')
    }
  }, [])

  return { devices, error, busyId, reload: load, resolve }
}
