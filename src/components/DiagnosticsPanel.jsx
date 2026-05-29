import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardCopy, LogOut, RefreshCw, Share2, Wrench } from 'lucide-react'
import { getDb, listSyncQueue } from '../lib/localDb'
import {
  APP_ERRORS_CHANGED,
  clearAppErrors,
  computeNeedsUserAttention,
  getPersistentErrorCount,
  pruneRecoverableAppErrors,
  subscribeSyncAttention,
} from '../lib/appErrorJournal'
import {
  buildDiagnosticReport,
  buildShortShareText,
  buildSystemState,
  ERROR_FILTERS,
  filterAppErrors,
  formatAppErrorTime,
  formatSyncQueueLine,
  formatSyncQueueLineHuman,
  formatLocalOnlyBreakdown,
  loadDiagnosticsErrors,
  resolveQuickFixes,
  sourceLabel,
  suggestErrorHint,
} from '../lib/appDiagnostics'
import { clearPoisonedSyncQueue, getSyncOutboundSummary } from '../lib/syncService'
import { pruneRedundantSyncQueue } from '../lib/syncQueueOrphans'

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

/**
 * @param {{
 *   variant?: 'modal' | 'page',
 *   context: object,
 *   onSyncNow?: () => void,
 *   syncBusy?: boolean,
 *   onCleared?: () => void,
 *   onClose?: () => void,
 *   onCopyFeedback?: (msg: string, tone?: string) => void,
 *   onSignOut?: () => void,
 * }} props
 */
export function DiagnosticsPanel({
  variant = 'modal',
  context,
  onSyncNow,
  syncBusy = false,
  onCleared,
  onClose,
  onCopyFeedback,
  onSignOut,
}) {
  const simpleMode = context?.isAdmin !== true
  const [filterId, setFilterId] = useState('all')
  const [persistentErrorCount, setPersistentErrorCount] = useState(0)
  const [needsAttention, setNeedsAttention] = useState(false)
  const [errors, setErrors] = useState([])
  const [queue, setQueue] = useState([])
  const [localOnlyCount, setLocalOnlyCount] = useState(0)
  const [localOnlyByTable, setLocalOnlyByTable] = useState({})
  const [clientNames, setClientNames] = useState({})
  const [queueLoading, setQueueLoading] = useState(true)
  const [copyBusy, setCopyBusy] = useState(false)
  const [repairBusy, setRepairBusy] = useState(false)
  const [showAllQueue, setShowAllQueue] = useState(false)
  const [showDetails, setShowDetails] = useState(!simpleMode)

  const refreshErrors = useCallback(() => {
    const list = loadDiagnosticsErrors(50)
    setErrors(list)
    setPersistentErrorCount(getPersistentErrorCount())
  }, [])

  useEffect(() => {
    pruneRecoverableAppErrors()
    refreshErrors()
  }, [refreshErrors])

  const refreshAttention = useCallback(
    (queueLen) => {
      setPersistentErrorCount(getPersistentErrorCount())
      setNeedsAttention(computeNeedsUserAttention(queueLen))
    },
    [],
  )

  const refreshQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      const db = await getDb()
      const [rows, clients, outbound] = await Promise.all([
        listSyncQueue(),
        db.getAll('clients'),
        getSyncOutboundSummary(),
      ])
      const cmap = {}
      for (const c of clients) cmap[String(c.id)] = String(c.name ?? c.full_name ?? '').trim() || 'Клиент'
      setClientNames(cmap)
      setQueue(Array.isArray(rows) ? rows : [])
      setLocalOnlyCount(outbound.localOnly ?? 0)
      setLocalOnlyByTable(outbound.byTable ?? {})
    } catch {
      setClientNames({})
      setQueue([])
      setLocalOnlyCount(0)
      setLocalOnlyByTable({})
    } finally {
      setQueueLoading(false)
    }
  }, [])

  const refreshAll = useCallback(() => {
    refreshErrors()
    void refreshQueue()
  }, [refreshErrors, refreshQueue])

  useEffect(() => {
    refreshAll()
    const unsubAttention = subscribeSyncAttention(refreshErrors)
    const onChanged = () => refreshAll()
    window.addEventListener(APP_ERRORS_CHANGED, onChanged)
    return () => {
      unsubAttention()
      window.removeEventListener(APP_ERRORS_CHANGED, onChanged)
    }
  }, [refreshAll])

  useEffect(() => {
    refreshAttention(queue.length + localOnlyCount)
  }, [queue.length, localOnlyCount, errors, refreshAttention])

  const system = useMemo(
    () =>
      buildSystemState({
        ...context,
        errorCount: persistentErrorCount,
        queueCount: queue.length,
      }),
    [context, persistentErrorCount, queue.length],
  )

  const filteredErrors = useMemo(() => filterAppErrors(errors, filterId), [errors, filterId])
  const quickFixes = useMemo(
    () => resolveQuickFixes({ errors, queue, localOnly: localOnlyCount, system }),
    [errors, queue, localOnlyCount, system],
  )

  const queuePreview = showAllQueue ? queue : queue.slice(0, 10)
  const queueHidden = queue.length > 10 && !showAllQueue

  const buildReport = () => buildDiagnosticReport({ system, errors, queue, filterId })

  const handleCopy = async () => {
    setCopyBusy(true)
    try {
      await copyText(buildReport())
      onCopyFeedback?.('Отчёт скопирован в буфер обмена')
    } catch {
      onCopyFeedback?.('Не удалось скопировать — выделите текст вручную', 'warn')
    } finally {
      setCopyBusy(false)
    }
  }

  const handleShare = async () => {
    setCopyBusy(true)
    try {
      const report = buildReport()
      const intro = buildShortShareText({ system, errors, queue })
      const full = `${intro}\n\n${report}`
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Фитнес-дневник — отчёт',
            text: full.slice(0, 8000),
          })
          onCopyFeedback?.('Отчёт отправлен')
          return
        } catch (e) {
          if (e?.name === 'AbortError') return
        }
      }
      await copyText(full)
      onCopyFeedback?.('Отчёт скопирован — вставьте в Telegram или WhatsApp')
    } catch {
      onCopyFeedback?.('Не удалось отправить отчёт', 'warn')
    } finally {
      setCopyBusy(false)
    }
  }

  const handleRepairQueue = async () => {
    setRepairBusy(true)
    try {
      await clearPoisonedSyncQueue()
      await pruneRedundantSyncQueue()
      await refreshQueue()
      onCopyFeedback?.('Очередь проверена: битые записи удалены')
    } catch {
      onCopyFeedback?.('Не удалось очистить очередь', 'warn')
    } finally {
      setRepairBusy(false)
    }
  }

  const handleClear = () => {
    clearAppErrors()
    refreshErrors()
    refreshAttention(queue.length + localOnlyCount)
    onCleared?.()
  }

  const localOnlyHint = useMemo(() => formatLocalOnlyBreakdown(localOnlyByTable), [localOnlyByTable])

  const outboundTotal = queue.length + localOnlyCount
  const statusTone =
    needsAttention && (queue.length > 0 || localOnlyCount > 0 || !system.online) ? 'warn' : system.online ? 'ok' : 'warn'

  const panelTitle = simpleMode ? 'Помощь при проблемах' : 'Журнал ошибок и диагностика'
  const panelSub = simpleMode
    ? 'Если что-то не синхронизируется — выполните шаги ниже'
    : 'Состояние устройства, очередь sync и подсказки по сбоям'

  return (
    <div className={`diagnostics-panel diagnostics-panel--${variant}${simpleMode ? ' diagnostics-panel--simple' : ''}`}>
      <div className="diagnostics-panel__head">
        <AlertTriangle size={22} className="diagnostics-panel__icon" aria-hidden />
        <div>
          <h3 id="app-error-journal-title" className="diagnostics-panel__title">
            {panelTitle}
          </h3>
          <p className="muted diagnostics-panel__sub">{panelSub}</p>
        </div>
      </div>

      <div className={`diagnostics-panel__status diagnostics-panel__status--${statusTone}`} role="status">
        {outboundTotal === 0 && !needsAttention ? (
          <>
            Всё работает: нечего отправлять в облако
            {persistentErrorCount > 0 ? ` · в журнале ${persistentErrorCount} (архив)` : ''}
          </>
        ) : outboundTotal === 0 && persistentErrorCount > 0 ? (
          <>
            Отправка в облако завершена. В журнале <strong>{persistentErrorCount}</strong> старых записей (можно
            очистить).
          </>
        ) : (
          <>
            {queue.length > 0 ? (
              <>
                В очереди sync <strong>{queue.length}</strong>
              </>
            ) : null}
            {localOnlyCount > 0 ? (
              <>
                {queue.length > 0 ? ', ' : ''}
                только на устройстве <strong>{localOnlyCount}</strong>
                {localOnlyHint ? <> ({localOnlyHint})</> : null}
              </>
            ) : null}
            {persistentErrorCount > 0 ? (
              <>
                {outboundTotal > 0 ? ' · ' : ''}
                в журнале ошибок <strong>{persistentErrorCount}</strong>
              </>
            ) : null}
            {!system.online ? ' · нет сети' : ''}
          </>
        )}
      </div>

      <section className="diagnostics-panel__fixes" aria-label="Что сделать">
        <h4 className="diagnostics-panel__section-title">
          <Wrench size={16} aria-hidden /> Что сделать сейчас
        </h4>
        <ol className="diagnostics-fix-list">
          {quickFixes.map((fix) => (
            <li key={fix.id} className={`diagnostics-fix diagnostics-fix--${fix.tone ?? 'info'}`}>
              <div className="diagnostics-fix__body">
                <strong>{fix.title}</strong>
                <p>{fix.detail}</p>
              </div>
              {fix.action === 'sync' && onSyncNow ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={syncBusy} onClick={onSyncNow}>
                  <RefreshCw size={14} className={syncBusy ? 'icon-spin' : undefined} aria-hidden />
                  Sync
                </button>
              ) : null}
              {fix.action === 'relogin' && onSignOut ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
                  <LogOut size={14} aria-hidden />
                  Выйти
                </button>
              ) : null}
              {fix.action === 'reload' ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
                  Обновить
                </button>
              ) : null}
              {fix.action === 'clean_queue' ? (
                <button type="button" className="btn btn-ghost btn-sm" disabled={repairBusy} onClick={() => void handleRepairQueue()}>
                  <RefreshCw size={14} className={repairBusy ? 'icon-spin' : undefined} aria-hidden />
                  Очистить
                </button>
              ) : null}
              {fix.action === 'share' ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={copyBusy} onClick={() => void handleShare()}>
                  <Share2 size={14} aria-hidden />
                  Отправить
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {simpleMode ? (
        <div className="diagnostics-panel__details-toggle">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            {showDetails ? 'Скрыть подробности' : 'Показать подробности'}
          </button>
        </div>
      ) : null}

      {(showDetails || !simpleMode) && (
        <>
          <section className="diagnostics-panel__state" aria-label="Состояние системы">
            <h4 className="diagnostics-panel__section-title">Состояние системы</h4>
            <dl className="diagnostics-state-grid">
              <div>
                <dt>Сеть</dt>
                <dd className={system.online ? 'diagnostics-ok' : 'diagnostics-warn'}>
                  {system.online ? 'Онлайн' : 'Офлайн'}
                </dd>
              </div>
              <div>
                <dt>Облако</dt>
                <dd className={system.supabaseReady ? 'diagnostics-ok' : 'diagnostics-muted'}>
                  {system.supabaseReady ? 'Подключено' : 'Локально'}
                </dd>
              </div>
              <div>
                <dt>Пользователь</dt>
                <dd>{system.userName}</dd>
              </div>
              <div>
                <dt>Роль</dt>
                <dd>{system.role}</dd>
              </div>
              <div>
                <dt>Клуб</dt>
                <dd title={system.clubId}>{system.clubName !== '—' ? system.clubName : system.clubId}</dd>
              </div>
              {!simpleMode ? (
                <>
                  <div>
                    <dt>Страница</dt>
                    <dd className="diagnostics-state-grid__mono">{system.pathname}</dd>
                  </div>
                  <div>
                    <dt>Приложение</dt>
                    <dd>v{system.appVersion}</dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt>Ошибок / очередь</dt>
                <dd>
                  <span className={persistentErrorCount > 0 ? 'diagnostics-warn' : 'diagnostics-ok'}>{persistentErrorCount}</span>
                  {' / '}
                  <span className={queue.length > 0 ? 'diagnostics-warn' : 'diagnostics-ok'}>{queue.length}</span>
                </dd>
              </div>
            </dl>
          </section>

          <section className="diagnostics-panel__queue" aria-label="Очередь синхронизации">
            <div className="diagnostics-panel__section-row">
              <h4 className="diagnostics-panel__section-title">Очередь синхронизации</h4>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refreshQueue()} disabled={queueLoading}>
                <RefreshCw size={14} className={queueLoading ? 'icon-spin' : undefined} aria-hidden />
                Обновить
              </button>
            </div>
            {queueLoading && queue.length === 0 ? (
              <p className="muted diagnostics-panel__empty-inline">Загрузка…</p>
            ) : queue.length === 0 ? (
              <p className="diagnostics-panel__empty-inline diagnostics-ok">Очередь пуста — всё отправлено в облако.</p>
            ) : (
              <>
                <p className="diagnostics-panel__queue-note">
                  {queue.length}{' '}
                  {queue.length === 1 ? 'запись ждёт отправки' : queue.length < 5 ? 'записи ждут отправки' : 'записей ждут отправки'}.
                </p>
                <ol className="diagnostics-panel__queue-list">
                  {queuePreview.map((item, i) => (
                    <li key={item.local_id ?? i}>
                      {simpleMode
                        ? formatSyncQueueLineHuman(item, i, { clientNames })
                        : `${formatSyncQueueLineHuman(item, i, { clientNames })} (${formatSyncQueueLine(item, i).split('. ')[1] ?? ''})`}
                    </li>
                  ))}
                </ol>
                {queueHidden ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAllQueue(true)}>
                    Показать все {queue.length}
                  </button>
                ) : null}
                {showAllQueue && queue.length > 10 ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAllQueue(false)}>
                    Свернуть
                  </button>
                ) : null}
              </>
            )}
          </section>

          <section className="diagnostics-panel__errors" aria-label="Журнал ошибок">
            <h4 className="diagnostics-panel__section-title">Журнал ошибок</h4>
            {!simpleMode ? (
              <div className="diagnostics-panel__filters" role="tablist" aria-label="Фильтр ошибок">
                {ERROR_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filterId === f.id}
                    className={`diagnostics-filter${filterId === f.id ? ' diagnostics-filter--active' : ''}`}
                    onClick={() => setFilterId(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : null}

            {filteredErrors.length === 0 ? (
              <p className="diagnostics-panel__empty">Ошибок нет — журнал пуст.</p>
            ) : (
              <ul className="diagnostics-panel__error-list">
                {filteredErrors.map((row, i) => {
                  const hint = suggestErrorHint(row)
                  return (
                    <li key={`${row.at}-${i}`} className="diagnostics-panel__error-item">
                      <div className="diagnostics-panel__error-meta">
                        <span className={`app-error-journal__tag app-error-journal__tag--${row.source}`}>
                          {sourceLabel(row.source)}
                        </span>
                        {row.status != null ? (
                          <span className="app-error-journal__status">HTTP {row.status}</span>
                        ) : null}
                        <time className="app-error-journal__time">{formatAppErrorTime(row.at)}</time>
                      </div>
                      {row.context ? <div className="app-error-journal__ctx">{row.context}</div> : null}
                      <div className="app-error-journal__msg">{row.error}</div>
                      {!simpleMode && row.detail ? <div className="app-error-journal__detail">{row.detail}</div> : null}
                      {hint ? (
                        <div className="diagnostics-panel__hint" role="note">
                          <strong>Что делать:</strong> {hint}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <div className="row diagnostics-panel__actions">
        <button type="button" className="btn btn-primary diagnostics-panel__copy" disabled={copyBusy} onClick={() => void handleShare()}>
          <Share2 size={16} aria-hidden />
          {copyBusy ? '…' : simpleMode ? 'Отправить отчёт' : 'Отправить / скопировать'}
        </button>
        {!simpleMode ? (
          <button type="button" className="btn btn-ghost" disabled={copyBusy} onClick={() => void handleCopy()}>
            <ClipboardCopy size={16} aria-hidden />
            Копировать
          </button>
        ) : null}
        {onSyncNow ? (
          <button type="button" className="btn btn-ghost" disabled={syncBusy} onClick={onSyncNow}>
            <RefreshCw size={16} className={syncBusy ? 'icon-spin' : undefined} aria-hidden />
            Sync
          </button>
        ) : null}
        {onClose ? (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost app-error-journal__clear"
          disabled={errors.length === 0}
          onClick={handleClear}
        >
          Очистить журнал
        </button>
      </div>
    </div>
  )
}
