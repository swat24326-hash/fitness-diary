import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useAuth } from '../context/AuthContext'
import { APP_BUILD_STALE_EVENT, APP_WAKE_EVENT, onLongAppWake } from '../lib/appLifecycle'
import {
  decideAppUpdate,
  hasFreshSalesDraftInStorage,
  isOnSalesReportPage,
} from '../lib/appUpdatePolicy'
import { planPwaUpdateAction, pwaUpdateBannerCopy } from '../lib/appUpdatePlanCore.js'
import { applyPwaUpdate } from '../lib/appUpdateApplyService.js'
import { shouldBlockAutoPwaReload } from '../lib/appUpdateReloadGuard.js'
import { readPwaUpdateReloadGuardFromSession } from '../lib/appUpdateReloadGuardSession.js'
import { clearAllSalesDraftsInStorage } from '../lib/admin/adminSalesDraftStorage.js'
import { setAppUpdatePending } from '../lib/appUpdateState'
import { listSyncQueue } from '../lib/localDb'

export function PwaUpdatePrompt() {
  const location = useLocation()
  const { loading: authLoading } = useAuth()
  const [updating, setUpdating] = useState(false)
  const [buildStale, setBuildStale] = useState(false)
  const [syncQueueCount, setSyncQueueCount] = useState(0)
  const [autoBlocked, setAutoBlocked] = useState(() =>
    shouldBlockAutoPwaReload(readPwaUpdateReloadGuardFromSession()),
  )
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
      setAutoBlocked(shouldBlockAutoPwaReload(readPwaUpdateReloadGuardFromSession()))
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
  const guard = readPwaUpdateReloadGuardFromSession()
  const planned = planPwaUpdateAction({
    decision: updateDecision,
    authLoading,
    guard,
    manual: false,
  })

  const runApply = useCallback(
    async ({ manual = false } = {}) => {
      if (updating) return
      setUpdating(true)
      setAutoBlocked(true)
      try {
        const result = await applyPwaUpdate({ manual, updateServiceWorker })
        if (result.mode === 'reload' || result.mode === 'hard_recover') {
          setNeedRefresh(false)
          setBuildStale(false)
          return
        }
        setUpdating(false)
      } catch {
        setUpdating(false)
      }
    },
    [updateServiceWorker, setNeedRefresh, updating],
  )

  useEffect(() => {
    if (!showPrompt || updating || autoTriedRef.current) return
    if (planned !== 'auto_apply') {
      if (planned === 'manual_only') setAutoBlocked(true)
      return
    }
    autoTriedRef.current = true
    void runApply({ manual: false })
  }, [showPrompt, planned, updating, runApply])

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
  const actionForCopy =
    salesDraftBlocksUpdate
      ? 'prompt'
      : autoBlocked || planned === 'manual_only'
        ? 'manual_only'
        : planned === 'defer'
          ? 'defer'
          : planned
  const copy = pwaUpdateBannerCopy({
    action: actionForCopy,
    salesDraftBlocks: salesDraftBlocksUpdate,
    offline: typeof navigator !== 'undefined' && !navigator.onLine,
  })
  const showPrimary = Boolean(copy.primary)

  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <div className="pwa-update__text">{copy.text}</div>
      <div className="pwa-update__actions">
        {showPrimary ? (
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={updating || authLoading}
            onClick={() => {
              if (salesDraftBlocksUpdate) clearAllSalesDraftsInStorage()
              void runApply({ manual: true })
            }}
          >
            {updating ? 'Обновление…' : copy.primary}
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
          {copy.secondary}
        </button>
      </div>
    </div>
  )
}
