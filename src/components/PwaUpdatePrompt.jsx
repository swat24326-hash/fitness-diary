import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { APP_BUILD_STALE_EVENT, APP_WAKE_EVENT, onLongAppWake } from '../lib/appLifecycle'
import {
  decideAppUpdate,
  hasFreshSalesDraftInStorage,
  isOnSalesReportPage,
  shouldAutoApplyUpdate,
} from '../lib/appUpdatePolicy'
import { clearAllSalesDraftsInStorage } from '../lib/admin/adminSalesDraftStorage.js'
import { clearAppUpdatePending, markAppUpdateApplied, setAppUpdatePending } from '../lib/appUpdateState'
import { listSyncQueue } from '../lib/localDb'

function postSkipWaiting(registration) {
  const waiting = registration?.waiting
  if (!waiting) return false
  waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}

export function PwaUpdatePrompt() {
  const location = useLocation()
  const [updating, setUpdating] = useState(false)
  const [buildStale, setBuildStale] = useState(false)
  const [syncQueueCount, setSyncQueueCount] = useState(0)
  const autoTriedRef = useRef(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registration?.update().catch(() => {})
    },
  })

  useEffect(() => {
    let alive = true
    const refreshQueue = async () => {
      try {
        const rows = await listSyncQueue()
        if (alive) setSyncQueueCount(Array.isArray(rows) ? rows.length : 0)
      } catch {
        if (alive) setSyncQueueCount(0)
      }
    }
    void refreshQueue()
    const onStale = () => setBuildStale(true)
    const onWake = () => {
      void refreshQueue()
    }
    window.addEventListener(APP_BUILD_STALE_EVENT, onStale)
    window.addEventListener(APP_WAKE_EVENT, onWake)
    const offLongWake = onLongAppWake(() => {
      void refreshQueue()
    })
    return () => {
      alive = false
      window.removeEventListener(APP_BUILD_STALE_EVENT, onStale)
      window.removeEventListener(APP_WAKE_EVENT, onWake)
      offLongWake()
    }
  }, [])

  const updateDecision = decideAppUpdate({
    pathname: location.pathname,
    syncQueueCount,
    isLoginScreen: location.pathname === '/login',
  })

  const showPrompt = needRefresh || buildStale

  const applyUpdate = useCallback(async () => {
    if (updating) return
    setUpdating(true)
    try {
      const registration = await navigator.serviceWorker?.getRegistration?.()
      postSkipWaiting(registration)

      await Promise.race([
        updateServiceWorker(true).catch((e) => {
          console.warn('[PWA] updateServiceWorker failed', e)
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])

      if (registration?.waiting) {
        postSkipWaiting(registration)
      }

      await new Promise((resolve) => {
        const sw = navigator.serviceWorker
        if (!sw) {
          resolve(undefined)
          return
        }
        const done = () => {
          sw.removeEventListener('controllerchange', done)
          resolve(undefined)
        }
        sw.addEventListener('controllerchange', done, { once: true })
        setTimeout(done, 1500)
      })
    } finally {
      markAppUpdateApplied()
      clearAppUpdatePending()
      setNeedRefresh(false)
      setBuildStale(false)
      window.location.reload()
    }
  }, [updateServiceWorker, setNeedRefresh, updating])

  useEffect(() => {
    if (!showPrompt || updating || autoTriedRef.current) return
    if (!shouldAutoApplyUpdate(updateDecision)) return
    autoTriedRef.current = true
    void applyUpdate()
  }, [showPrompt, updateDecision, updating, applyUpdate])

  useEffect(() => {
    if (!showPrompt) autoTriedRef.current = false
  }, [showPrompt])

  useEffect(() => {
    if (showPrompt) setAppUpdatePending(true)
  }, [showPrompt])

  if (!showPrompt) return null

  const deferUpdate = updateDecision === 'defer'
  const salesDraftBlocksUpdate =
    deferUpdate && isOnSalesReportPage(location.pathname) && hasFreshSalesDraftInStorage()

  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <div className="pwa-update__text">
        {salesDraftBlocksUpdate
          ? 'Доступна новая версия. На экране отчёта есть несохранённый черновик (часто «хвост» плана в телефоне). Сохраните план или сбросьте черновик — тогда можно обновить.'
          : deferUpdate
            ? 'Доступна новая версия — обновим, когда закончите тренировку или сохраните отчёт продаж.'
            : 'Доступна новая версия. Нажмите один раз — всё обновится само.'}
        {!navigator.onLine && (
          <span className="muted"> Сейчас офлайн — обновление применится при появлении интернета.</span>
        )}
      </div>
      <div className="pwa-update__actions">
        {!deferUpdate ? (
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={updating}
            onClick={() => void applyUpdate()}
          >
            {updating ? 'Обновление…' : 'Обновить сейчас'}
          </button>
        ) : null}
        {salesDraftBlocksUpdate ? (
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={updating}
            onClick={() => {
              clearAllSalesDraftsInStorage()
              void applyUpdate()
            }}
          >
            {updating ? 'Обновление…' : 'Сбросить черновик и обновить'}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-touch"
          disabled={updating}
          onClick={() => {
            setNeedRefresh(false)
            setBuildStale(false)
            setAppUpdatePending(true)
          }}
        >
          {deferUpdate ? 'Понятно' : 'Позже'}
        </button>
      </div>
    </div>
  )
}
