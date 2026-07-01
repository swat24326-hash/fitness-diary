import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { listSyncQueue } from '../../lib/localDb'
import { getPersistentErrorCount, subscribeSyncAttention } from '../../lib/appErrorJournal'
import { formatAppErrorTime, loadDiagnosticsErrors, suggestErrorHint, sourceLabel } from '../../lib/appDiagnostics'
import { subscribeNetworkStatus } from '../../lib/networkReachability'
import { isSupabaseConfigured } from '../../lib/supabase'
import { listClubsLocal, pullClubsFromSupabase } from '../../lib/dataAccess'
import { DiagnosticsPanel } from '../../components/DiagnosticsPanel'
import { describeFlushQueueResult, flushSyncQueue, isAppOnline } from '../../lib/syncService'

export function AdminDiagnostics() {
  const { user, supabaseReady } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''

  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? isAppOnline() : true))
  const [clubName, setClubName] = useState('—')
  const [persistentErrorCount, setPersistentErrorCount] = useState(0)
  const [queueCount, setQueueCount] = useState(0)
  const [syncBusy, setSyncBusy] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => subscribeNetworkStatus(setOnline), [])
  const refreshAttention = useCallback(() => {
    setPersistentErrorCount(getPersistentErrorCount())
  }, [])

  useEffect(() => {
    refreshAttention()
    return subscribeSyncAttention(refreshAttention)
  }, [refreshAttention])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (supabaseReady) await pullClubsFromSupabase()
        const clubs = await listClubsLocal()
        const hit = clubs.find((c) => String(c.id) === clubId)
        if (alive) setClubName(hit?.name ?? (clubId || '—'))
      } catch {
        if (alive) setClubName(clubId || '—')
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [clubId, supabaseReady])

  const refreshQueueCount = useCallback(async () => {
    try {
      const q = await listSyncQueue()
      setQueueCount(q.length)
    } catch {
      setQueueCount(0)
    }
  }, [])

  useEffect(() => {
    void refreshQueueCount()
    const t = window.setInterval(() => void refreshQueueCount(), 5000)
    return () => window.clearInterval(t)
  }, [refreshQueueCount])

  useEffect(() => {
    refreshAttention()
  }, [queueCount, refreshAttention])

  const lastError = useMemo(() => loadDiagnosticsErrors(1)[0] ?? null, [persistentErrorCount])

  const panelContext = useMemo(
    () => ({
      user,
      role: 'admin',
      isAdmin: true,
      online,
      supabaseReady: supabaseReady && isSupabaseConfigured(),
      clubId,
      clubName,
      pathname: location.pathname + location.search,
    }),
    [user, online, supabaseReady, clubId, clubName, location.pathname, location.search],
  )

  const showToast = (text, tone = 'ok') => {
    setToast({ text, tone })
    window.setTimeout(() => setToast(null), 5000)
  }

  const syncNow = async () => {
    if (syncBusy) return
    setSyncBusy(true)
    try {
      if (!isAppOnline()) {
        showToast('Нет сети — синхронизация отложена', 'warn')
        return
      }
      const flush = await flushSyncQueue({ force: true, waitUntilDone: true })
      const desc = describeFlushQueueResult(flush)
      if (desc.offline) showToast(desc.message, 'warn')
      else if (desc.hadError) showToast(desc.message || 'Синхронизация с замечаниями', 'warn')
      else showToast('Синхронизация завершена', 'ok')
      await refreshQueueCount()
    } catch (e) {
      showToast(e?.message ?? 'Ошибка синхронизации', 'err')
    } finally {
      setSyncBusy(false)
    }
  }

  return (
    <div className="admin-diagnostics">
      <header className="admin-diagnostics__header">
        <Link to={`/admin${clubQs}`} className="btn btn-ghost btn-sm admin-diagnostics__back">
          <ChevronLeft size={18} aria-hidden />
          Админпанель
        </Link>
        <h1 className="admin-diagnostics__title">Диагностика</h1>
        <p className="muted admin-diagnostics__intro">
          Состояние этого устройства, очередь sync и журнал ошибок. Скопируйте отчёт и отправьте разработчику или тренеру
          с планшета — так проще найти причину сбоя.
        </p>
      </header>

      <div className="admin-diagnostics__summary" aria-label="Краткая сводка">
        <div className={`admin-diagnostics__stat${persistentErrorCount > 0 ? ' admin-diagnostics__stat--warn' : ''}`}>
          <span className="admin-diagnostics__stat-value">{persistentErrorCount}</span>
          <span className="admin-diagnostics__stat-label">важных в журнале</span>
        </div>
        <div className={`admin-diagnostics__stat${queueCount > 0 ? ' admin-diagnostics__stat--warn' : ''}`}>
          <span className="admin-diagnostics__stat-value">{queueCount}</span>
          <span className="admin-diagnostics__stat-label">в очереди sync</span>
        </div>
        <div className={`admin-diagnostics__stat${online ? '' : ' admin-diagnostics__stat--warn'}`}>
          <span className="admin-diagnostics__stat-value">{online ? 'OK' : '—'}</span>
          <span className="admin-diagnostics__stat-label">сеть</span>
        </div>
      </div>

      {lastError ? (
        <div className="admin-diagnostics__last-error" role="status">
          <span className="muted">Последняя ошибка:</span>{' '}
          <span className={`app-error-journal__tag app-error-journal__tag--${lastError.source}`}>
            {sourceLabel(lastError.source)}
          </span>{' '}
          {formatAppErrorTime(lastError.at)} — {String(lastError.error).slice(0, 120)}
          {suggestErrorHint(lastError) ? (
            <p className="diagnostics-panel__hint admin-diagnostics__last-hint">{suggestErrorHint(lastError)}</p>
          ) : null}
        </div>
      ) : (
        <p className="admin-diagnostics__last-error diagnostics-ok">Последних ошибок нет.</p>
      )}

      <DiagnosticsPanel
        variant="page"
        context={panelContext}
        onSyncNow={() => void syncNow()}
        syncBusy={syncBusy}
        onCleared={() => showToast('Журнал ошибок очищен', 'ok')}
        onCopyFeedback={(msg, tone) => showToast(msg, tone ?? 'ok')}
      />

      {toast ? (
        <div className={`sync-feedback sync-feedback--${toast.tone} admin-diagnostics__toast`} role="status">
          {toast.text}
        </div>
      ) : null}
    </div>
  )
}
