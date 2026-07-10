import { useCallback, useEffect, useRef, useState } from 'react'
import { pullAdminClientsFromCloud } from '../lib/admin/adminClientsListService'
import { pullTrainerWorkspaceFromCloud } from '../lib/trainerPullService'
import { listSyncQueue } from '../lib/localDb'
import { describeFlushQueueResult, flushSyncQueue, getSyncOutboundSummary, isAppOnline } from '../lib/syncService'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  collectTrainerClubIds,
  dispatchLocalDataChanged,
  LOCAL_DATA_CHANGED,
} from '../lib/dataAccess'
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
import { SYNC_NOW_REQUEST } from '../lib/syncUiBridge'

export function useHeaderSync({ user, isAdmin, isSalesManager, supabaseReady, searchParams, menuOpen, closeMenu }) {
  const [pendingSync, setPendingSync] = useState(0)
  const [unsyncedLocal, setUnsyncedLocal] = useState(0)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ percent: 0, label: '' })
  const [syncFeedback, setSyncFeedback] = useState(null)
  const syncFeedbackTimerRef = useRef(null)
  const [errorJournalOpen, setErrorJournalOpen] = useState(false)
  const [needsAttention, setNeedsAttention] = useState(false)
  const [persistentErrorCount, setPersistentErrorCount] = useState(0)
  const pendingSyncRef = useRef(0)

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

  const showSyncFeedback = (text, tone = 'ok') => {
    if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    setSyncFeedback({ text, tone })
    syncFeedbackTimerRef.current = setTimeout(() => {
      setSyncFeedback(null)
      syncFeedbackTimerRef.current = null
    }, 6000)
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
    setSyncProgress({ percent: pct, label: text })
    if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    setSyncFeedback({ text: text ? `${pct}% — ${text}` : `${pct}%`, tone: 'ok' })
  }

  const syncNowRef = useRef(async () => {})

  const syncNow = async () => {
    if (syncBusy) return
    closeMenu()
    setSyncBusy(true)
    setSyncFeedback(null)
    bumpSyncProgress(0, 'Старт…')

    const parts = []
    let hadError = false

    try {
      if (!isAppOnline()) {
        recordAppError({ source: 'network', error: 'Нет сети — синхронизация отложена' })
        showSyncFeedback('Нет Wi‑Fi — синхронизация отложена.', 'warn')
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
          const { pullExercisesFromCloud, pullChallengesForClubFromCloud, pullMembershipTypesForClubFromCloud } =
            await import('../lib/pullReferenceData')
          bumpSyncProgress(76, 'Справочник упражнений…')
          // Sync нажимают вручную, и ожидают увидеть свежие правки админа сразу.
          // `exercises-meta` основан на created_at и не ловит правки без новой записи, поэтому тут форсим pull.
          await pullExercisesFromCloud({ force: true })
          parts.push('справочник')

          if (isAdmin) {
            const club = searchParams.get('club')?.trim()
            if (club) {
              bumpSyncProgress(82, 'Клиенты клуба…')
              const { listChallengesLocalForClub, pushChallengeToCloud } = await import('../lib/challengeService')
              for (const ch of await listChallengesLocalForClub(club)) {
                await pushChallengeToCloud(ch)
              }
              const pull = await pullAdminClientsFromCloud(club)
              if (pull?.ok) {
                let msg = `клиенты (${pull.count ?? 0})`
                if ((pull.pruned_clients ?? 0) > 0 || (pull.pruned_trainings ?? 0) > 0) {
                  msg += `, очищено кэша: ${pull.pruned_clients ?? 0} кл. / ${pull.pruned_trainings ?? 0} черн.`
                }
                parts.push(msg)
              }
              bumpSyncProgress(92, 'Челленджи…')
              const chPull = await pullChallengesForClubFromCloud(club)
              if (!chPull?.ok) {
                hadError = true
                parts.push(`челленджи: ${chPull.error ?? 'ошибка'}`)
              } else {
                let chMsg = `челленджи (${chPull.count ?? 0})`
                if ((chPull.pruned ?? 0) > 0) chMsg += `, убрано ${chPull.pruned}`
                parts.push(chMsg)
              }
              bumpSyncProgress(94, 'Типы абонементов…')
              const mtPull = await pullMembershipTypesForClubFromCloud(club)
              if (!mtPull?.ok) {
                hadError = true
                parts.push(`типы абон.: ${mtPull.error ?? 'ошибка'}`)
              } else {
                parts.push(`типы абон. (${mtPull.count ?? 0})`)
              }
            } else {
              parts.push('клиенты: выберите клуб')
            }
            } else if (isSalesManager && user?.club_id) {
              bumpSyncProgress(88, 'Типы абонементов…')
              const mtPull = await pullMembershipTypesForClubFromCloud(String(user.club_id))
              if (!mtPull?.ok) {
                hadError = true
                parts.push(`типы абон.: ${mtPull.error ?? 'ошибка'}`)
              } else {
                parts.push(`типы абон. (${mtPull.count ?? 0})`)
              }
              parts.push('отчёт продаж — нажмите «Обновить» на странице')
            } else if (user?.id) {
            bumpSyncProgress(84, 'Клиенты и тренировки…')
            const pull = await pullTrainerWorkspaceFromCloud(user.id)
            if (pull?.ok) {
              let msg = `рабочая область (${pull.count ?? 0} кл.)`
              if ((pull.pruned_clients ?? 0) > 0) msg += `, убрано из кэша: ${pull.pruned_clients}`
              parts.push(msg)
            } else if (pull?.error) {
              hadError = true
              parts.push(`тренер: ${pull.error}`)
            }
            const clubIds = await collectTrainerClubIds(user.id, user?.club_id)
            let chTotal = 0
            let chPruned = 0
            let chFailed = false
            const clubList = [...clubIds]
            for (let ci = 0; ci < clubList.length; ci++) {
              const cid = clubList[ci]
              if (clubList.length > 1) {
                bumpSyncProgress(90 + Math.round(((ci + 1) / clubList.length) * 8), 'Челленджи…')
              } else {
                bumpSyncProgress(94, 'Челленджи…')
              }
              const chPull = await pullChallengesForClubFromCloud(cid)
              if (!chPull?.ok) {
                chFailed = true
                hadError = true
                parts.push(`челленджи: ${chPull.error ?? 'ошибка'}`)
                break
              }
              chTotal += chPull.count ?? 0
              chPruned += chPull.pruned ?? 0
              const mtPull = await pullMembershipTypesForClubFromCloud(cid)
              if (!mtPull?.ok) {
                chFailed = true
                hadError = true
                parts.push(`типы абон.: ${mtPull.error ?? 'ошибка'}`)
                break
              }
            }
            if (!chFailed) {
              let chMsg = `челленджи (${chTotal})`
              if (chPruned > 0) chMsg += `, убрано ${chPruned}`
              parts.push(chMsg)
            }
          }
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
        showSyncFeedback(
          `Не всё ушло в облако: в очереди ${queueLeft} ${queueLeft === 1 ? 'запись' : 'записей'}. Данные на устройстве сохранены — проверьте сеть и нажмите Sync снова.`,
          'warn',
        )
      } else if (hadError) {
        bumpSyncProgress(100, 'Готово с замечаниями')
        showSyncFeedback(`Синхронизация с замечаниями: ${parts.join(' · ')}.`, 'warn')
      } else {
        bumpSyncProgress(100, 'Готово')
        showSyncFeedback(parts.length ? `Готово: ${parts.join(' · ')}.` : 'Синхронизация завершена.', 'ok')
      }

      reportSyncOutcome({ queueCount: queueLeft, hadError })
    } catch (e) {
      console.warn('[sync]', e)
      recordAppError({ source: 'sync', error: e?.message ?? 'Ошибка синхронизации' })
      showSyncFeedback(e?.message ?? 'Ошибка синхронизации', 'err')
      try {
        const q = await listSyncQueue()
        reportSyncOutcome({ queueCount: q.length, hadError: true })
      } catch {
        reportSyncOutcome({ queueCount: pendingSyncRef.current, hadError: true })
      }
    } finally {
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
