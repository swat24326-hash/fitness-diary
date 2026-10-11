import { useCallback, useEffect, useState } from 'react'

async function currentEndpoint() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return ''
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return sub?.endpoint ?? ''
}

/**
 * Напоминания Ежедневника на этом устройстве — флаг подписки на сервере (за 15 минут до записи).
 * Работает только поверх включённых уведомлений: без подписки настраивать нечего.
 * @param {{ pushOn: boolean, prefs: (endpoint: string, value?: boolean) => Promise<{ ok?: boolean, migration_pending?: boolean, schedule_reminders?: boolean }> }} p
 */
export function useScheduleReminderSetting({ pushOn, prefs }) {
  const [state, setState] = useState({ status: 'idle', on: true, endpoint: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pushOn) {
      setState({ status: 'idle', on: true, endpoint: '' })
      return undefined
    }
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    ;(async () => {
      const endpoint = await currentEndpoint()
      if (!endpoint) return { status: 'unavailable', on: true, endpoint }
      const data = await prefs(endpoint)
      if (data?.migration_pending) return { status: 'unavailable', on: true, endpoint }
      return { status: 'ready', on: data?.schedule_reminders !== false, endpoint }
    })()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unavailable', on: true, endpoint: '' })
      })
    return () => {
      cancelled = true
    }
  }, [pushOn, prefs])

  const toggle = useCallback(async () => {
    if (state.status !== 'ready') return
    const next = !state.on
    setBusy(true)
    setError('')
    setState((s) => ({ ...s, on: next }))
    try {
      const data = await prefs(state.endpoint, next)
      if (data?.ok === false) throw new Error('Настройка пока недоступна на сервере')
    } catch (e) {
      setState((s) => ({ ...s, on: !next }))
      setError(e?.message ? String(e.message) : 'Не удалось сохранить настройку')
    } finally {
      setBusy(false)
    }
  }, [state, prefs])

  return { status: state.status, on: state.on, busy, error, toggle }
}
