import { useCallback, useEffect, useRef, useState } from 'react'
import { listSyncQueue } from '../lib/localDb'
import { describeFlushQueueResult, flushSyncQueue, getSyncOutboundSummary, isAppOnline, setBackgroundSyncPaused } from '../lib/syncService'
import { isSupabaseConfigured } from '../lib/supabase'
import { dispatchLocalDataChanged, LOCAL_DATA_CHANGED } from '../lib/dataAccess'
import {
  computeNeedsUserAttention,
  getPersistentErrorCount,
  getRecentSyncErrors,
  initSyncAttentionFromJournal,
  recordAppError,
  reportSyncOutcome,
  subscribeSyncAttention,
} from '../lib/appErrorJournal'
import {
  formatSyncOutboundMenuLabel,
  formatSyncOutboundShort,
  formatSyncOutboundTitle,
} from '../lib/syncOutboundLabel'
import {
  SYNC_MOTTO_ZONE_ROTATE_MS,
  createSyncSessionSeed,
  getSyncMotivationZone,
  pickSyncMotivationCard,
  setLastSyncReport,
} from '../lib/syncMotivationCore'
import { resolveHeaderSyncForceFromCloud, runHeaderSyncPull } from '../lib/syncHeaderPullService'
import { SYNC_NOW_REQUEST } from '../lib/syncUiBridge'

export function useHeaderSync({ user, isAdmin, isSalesManager, supabaseReady, searchParams, menuOpen, closeMenu }) {
  const [pendingSync, setPendingSync] = useState(0)
  const [unsyncedLocal, setUnsyncedLocal] = useState(0)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ percent: 0, label: '' })
  const [syncFeedback, setSyncFeedback] = useState(null)
  const syncFeedbackTimerRef = useRef(null)
  const mottoSessionRef = useRef(/** @type {{
    seed: number,
    zone: number,
    zoneStartedAt: number,
    slot: number,
    usedIds: string[],
    cardId: string | null,
  } | null} */ (null))
  const [errorJournalOpen, setErrorJournalOpen] = useState(false)
  const [needsAttention, setNeedsAttention] = useState(false)
  const [persistentErrorCount, setPersistentErrorCount] = useState(0)
  const pendingSyncRef = useRef(0)
  const syncPercentRef = useRef(0)

  const refreshSyncOutbound = async () => {
    if (!isSupabaseConfigured()) {
      setPendingSync(0)
      setUnsyncedLocal(0)
      pendingSyncRef.current = 0
      return
    }
    try {
      const s = await getSyncOutboundSummary()
      setPendingSync(s.queue)
      setUnsyncedLocal(s.localOnly)
      pendingSyncRef.current = s.total
    } catch {
      setPendingSync(0)
      setUnsyncedLocal(0)
      pendingSyncRef.current = 0
    }
  }

  const refreshAttention = useCallback(() => {
    setPersistentErrorCount(getPersistentErrorCount())
    setNeedsAttention(computeNeedsUserAttention(pendingSyncRef.current))
  }, [])

  useEffect(() => {
    pendingSyncRef.current = pendingSync
    refreshAttention()
  }, [pendingSync, refreshAttention])

  useEffect(() => {
    initSyncAttentionFromJournal()
    return subscribeSyncAttention(refreshAttention)
  }, [refreshAttention])

  useEffect(() => {
    void refreshSyncOutbound()
    let debounce = null
    const onData = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void refreshSyncOutbound()
      }, 900)
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onData)
    return () => {
      if (debounce) clearTimeout(debounce)
      window.removeEventListener(LOCAL_DATA_CHANGED, onData)
    }
  }, [])

  useEffect(() => {
    if (menuOpen) void refreshSyncOutbound()
  }, [menuOpen])

  const showSyncFeedback = (text, tone = 'ok', holdMs = 6000) => {
    mottoSessionRef.current = null
    if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    setSyncFeedback({ mode: 'plain', text, tone })
    syncFeedbackTimerRef.current = setTimeout(() => {
      setSyncFeedback(null)
      syncFeedbackTimerRef.current = null
    }, holdMs)
  }

  const showSyncMotto = (card, tone = 'ok', holdMs = 0) => {
    if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    setSyncFeedback({ mode: 'motto', card, tone })
    if (holdMs > 0) {
      syncFeedbackTimerRef.current = setTimeout(() => {
        setSyncFeedback(null)
        syncFeedbackTimerRef.current = null
      }, holdMs)
    } else {
      syncFeedbackTimerRef.current = null
    }
  }

  const applyMottoForPercent = (percent) => {
    const zone = getSyncMotivationZone(percent)
    const now = Date.now()
    let session = mottoSessionRef.current
    if (!session) {
      session = {
        seed: createSyncSessionSeed(),
        zone: -1,
        zoneStartedAt: now,
        slot: 0,
        usedIds: [],
        cardId: null,
      }
      mottoSessionRef.current = session
    }

    const zoneChanged = session.zone !== zone
    const dwellRotate =
      !zoneChanged &&
      zone < 4 &&
      session.cardId &&
      now - session.zoneStartedAt >= SYNC_MOTTO_ZONE_ROTATE_MS

    if (zoneChanged) {
      if (session.cardId) session.usedIds = [...session.usedIds, session.cardId].slice(-12)
      session.zone = zone
      session.zoneStartedAt = now
      session.slot = 0
    } else if (dwellRotate) {
      if (session.cardId) session.usedIds = [...session.usedIds, session.cardId].slice(-12)
      session.slot += 1
      session.zoneStartedAt = now
    } else if (session.cardId && zone < 4) {
      return
    }

    const card = pickSyncMotivationCard({
      percent,
      sessionSeed: session.seed,
      excludeIds: session.usedIds,
      slot: session.slot,
    })
    session.cardId = card.id
    showSyncMotto(card, 'ok', zone === 4 ? 7500 : 0)
  }

  const openErrorJournal = () => {
    closeMenu()
    setErrorJournalOpen(true)
  }

  useEffect(
    () => () => {
      if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    },
    [],
  )

  const bumpSyncProgress = (percent, label) => {
    const pct = Math.min(100, Math.max(0, Math.round(percent)))
    const text = String(label ?? '')
    syncPercentRef.current = pct
    setSyncProgress({ percent: pct, label: text })
    applyMottoForPercent(pct)
  }

  useEffect(() => {
    if (!syncBusy) return undefined
    const id = window.setInterval(() => {
      applyMottoForPercent(syncPercentRef.current)
    }, 2000)
    return () => window.clearInterval(id)
  }, [syncBusy])

  const syncNowRef = useRef(async () => {})

  const syncNow = async () => {
    if (syncBusy) return
    closeMenu()
    setSyncBusy(true)
    setSyncFeedback(null)
    mottoSessionRef.current = {
      seed: createSyncSessionSeed(),
      zone: -1,
      zoneStartedAt: Date.now(),
      slot: 0,
      usedIds: [],
      cardId: null,
    }
    bumpSyncProgress(0, 'Старт…')

    const parts = []
    let hadError = false

    const saveTechReport = (tone, message) => {
      setLastSyncReport({
        at: Date.now(),
        tone,
        parts: [...parts],
        message: message || (parts.length ? parts.join(' · ') : 'Синхронизация завершена'),
      })
    }

    setBackgroundSyncPaused(true)
    try {
      if (!isAppOnline()) {
        recordAppError({ source: 'network', error: 'Нет сети — синхронизация отложена' })
        showSyncFeedback('Нет Wi‑Fi — синхронизация отложена.', 'warn')
        saveTechReport('warn', 'Нет Wi‑Fi — синхронизация отложена.')
        reportSyncOutcome({ queueCount: pendingSyncRef.current, hadError: true })
        return
      }

      const flush = await flushSyncQueue({
        force: true,
        waitUntilDone: true,
        onProgress: ({ done, total }) => {
          const queueShare = total > 0 ? Math.round((done / total) * 72) : 72
          bumpSyncProgress(4 + queueShare, total > 0 ? `Отправка ${done} из ${total}` : 'Отправка очереди…')
        },
      })
      const flushDesc = describeFlushQueueResult(flush)
      if (flushDesc.offline) {
        showSyncFeedback(flushDesc.message, 'warn')
        saveTechReport('warn', flushDesc.message)
        reportSyncOutcome({ queueCount: pendingSyncRef.current, hadError: true })
        return
      }
      if (flush?.reason === 'pending_items' && (flush?.remaining ?? 0) > 0) {
        const top = getRecentSyncErrors(1)[0]
        if (top?.error) {
          parts.push(`ошибка: ${String(top.error).slice(0, 80)}`)
        }
      }
      if (flushDesc.part) parts.push(flushDesc.part)
      if ((flush.requeued ?? 0) > 0) {
        parts.unshift(`в очередь +${flush.requeued}`)
      }
      if (flushDesc.hadError) hadError = true

      if (flush?.ok) {
        bumpSyncProgress(74, 'Очередь отправлена')
      }

      if (isSupabaseConfigured() && !flushDesc.offline) {
        try {
          const pullErr = await runHeaderSyncPull({
            isSalesManager,
            isAdmin,
            user,
            clubFromUrl: searchParams?.get('club')?.trim(),
            forceFromCloud: resolveHeaderSyncForceFromCloud(flush?.ok),
            bump: bumpSyncProgress,
            parts,
          })
          if (pullErr) hadError = true
        } catch (e) {
          hadError = true
          console.warn('[sync] pull', e)
          recordAppError({ source: 'pull', error: e?.message ?? 'Ошибка загрузки данных' })
          parts.push('ошибка загрузки')
        }
      }

      const { pruneRedundantSyncQueue } = await import('../lib/syncQueueOrphans')
      await pruneRedundantSyncQueue()
      await refreshSyncOutbound()
      const queueLeft = (await listSyncQueue()).length
      dispatchLocalDataChanged({ reason: 'sync-complete' })

      if (queueLeft > 0) {
        hadError = true
        const top = getRecentSyncErrors(1)[0]
        recordAppError({
          source: 'sync',
          error: top?.error ?? `В очереди осталось ${queueLeft} записей`,
          context: top?.context,
          status: top?.status,
        })
        bumpSyncProgress(98, `В очереди: ${queueLeft}`)
        const warnMsg = `Не всё ушло в облако: в очереди ${queueLeft} ${queueLeft === 1 ? 'запись' : 'записей'}. Данные на устройстве сохранены — проверьте сеть и нажмите Sync снова.`
        showSyncFeedback(warnMsg, 'warn')
        saveTechReport('warn', warnMsg)
      } else if (hadError) {
        bumpSyncProgress(100, 'Готово с замечаниями')
        const warnMsg = `Синхронизация с замечаниями: ${parts.join(' · ')}.`
        showSyncFeedback(warnMsg, 'warn')
        saveTechReport('warn', warnMsg)
      } else {
        bumpSyncProgress(100, 'Готово')
        saveTechReport('ok', parts.length ? `Готово: ${parts.join(' · ')}.` : 'Синхронизация завершена.')
        // Карточка 23 уже через applyMottoForPercent(100); hold 7.5 с задан в showSyncMotto.
      }

      reportSyncOutcome({ queueCount: queueLeft, hadError })
    } catch (e) {
      console.warn('[sync]', e)
      recordAppError({ source: 'sync', error: e?.message ?? 'Ошибка синхронизации' })
      const errMsg = e?.message ?? 'Ошибка синхронизации'
      showSyncFeedback(errMsg, 'err')
      saveTechReport('err', errMsg)
      try {
        const q = await listSyncQueue()
        reportSyncOutcome({ queueCount: q.length, hadError: true })
      } catch {
        reportSyncOutcome({ queueCount: pendingSyncRef.current, hadError: true })
      }
    } finally {
      setBackgroundSyncPaused(false)
      setSyncBusy(false)
      window.setTimeout(() => setSyncProgress({ percent: 0, label: '' }), 800)
    }
  }

  syncNowRef.current = syncNow

  useEffect(() => {
    const onRequest = () => {
      void syncNowRef.current()
    }
    window.addEventListener(SYNC_NOW_REQUEST, onRequest)
    return () => window.removeEventListener(SYNC_NOW_REQUEST, onRequest)
  }, [])

  const showHeaderSync = supabaseReady
  const syncOutboundTotal = pendingSync + unsyncedLocal
  const syncHasPending = syncOutboundTotal > 0
  const syncOutboundLabelShort = formatSyncOutboundShort({
    queue: pendingSync,
    localOnly: unsyncedLocal,
    total: syncOutboundTotal,
  })
  const syncBtnClass = [
    'btn',
    'btn-ghost',
    'app-header__action',
    'app-header__sync-btn',
    syncBusy ? 'app-header__sync-btn--busy' : syncHasPending ? 'app-header__sync-btn--pending' : 'app-header__sync-btn--idle',
  ].join(' ')
  const syncBtnTitle = formatSyncOutboundTitle({
    queue: pendingSync,
    localOnly: unsyncedLocal,
    busy: syncBusy,
    percent: syncProgress.percent,
    progressLabel: syncProgress.label,
  })
  const syncMenuLabel = formatSyncOutboundMenuLabel({
    queue: pendingSync,
    localOnly: unsyncedLocal,
    total: syncOutboundTotal,
  })

  return {
    showHeaderSync,
    syncOutboundTotal,
    syncHasPending,
    syncOutboundLabelShort,
    syncBtnClass,
    syncBtnTitle,
    syncMenuLabel,
    syncBusy,
    syncProgress,
    syncNow,
    syncFeedback,
    showSyncFeedback,
    needsAttention,
    persistentErrorCount,
    errorJournalOpen,
    setErrorJournalOpen,
    openErrorJournal,
  }
}
