import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCopy, RefreshCw } from 'lucide-react'
import { listSyncQueue } from '../lib/localDb'
import { APP_ERRORS_CHANGED, clearAppErrors, subscribeAppErrors } from '../lib/appErrorJournal'
import {
  buildDiagnosticReport,
  buildSystemState,
  ERROR_FILTERS,
  filterAppErrors,
  formatAppErrorTime,
  formatSyncQueueLine,
  loadDiagnosticsErrors,
  sourceLabel,
  suggestErrorHint,
} from '../lib/appDiagnostics'

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
 *   onCopyFeedback?: (msg: string) => void,
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
}) {
  const [filterId, setFilterId] = useState('all')
  const [errorCount, setErrorCount] = useState(0)
  const [errors, setErrors] = useState([])
  const [queue, setQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [copyBusy, setCopyBusy] = useState(false)
  const [showAllQueue, setShowAllQueue] = useState(false)

  const refreshErrors = useCallback(() => {
    const list = loadDiagnosticsErrors(50)
    setErrors(list)
    setErrorCount(list.length)
  }, [])

  const refreshQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      const rows = await listSyncQueue()
      setQueue(Array.isArray(rows) ? rows : [])
    } catch {
      setQueue([])
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
    const unsubCount = subscribeAppErrors(setErrorCount)
    const onChanged = () => refreshAll()
    window.addEventListener(APP_ERRORS_CHANGED, onChanged)
    return () => {
      unsubCount()
      window.removeEventListener(APP_ERRORS_CHANGED, onChanged)
    }
  }, [refreshAll])

  const system = useMemo(
    () =>
      buildSystemState({
        ...context,
        errorCount,
        queueCount: queue.length,
      }),
    [context, errorCount, queue.length],
  )

  const filteredErrors = useMemo(() => filterAppErrors(errors, filterId), [errors, filterId])

  const queuePreview = showAllQueue ? queue : queue.slice(0, 10)
  const queueHidden = queue.length > 10 && !showAllQueue

  const handleCopy = async () => {
    setCopyBusy(true)
    try {
      const report = buildDiagnosticReport({ system, errors, queue, filterId })
      await copyText(report)
      onCopyFeedback?.('Отчёт скопирован в буфер обмена')
    } catch {
      onCopyFeedback?.('Не удалось скопировать — выделите текст вручную', 'warn')
    } finally {
      setCopyBusy(false)
    }
  }

  const handleClear = () => {
    clearAppErrors()
    refreshErrors()
    onCleared?.()
  }

  return (
    <div className={`diagnostics-panel diagnostics-panel--${variant}`}>
      <div className="diagnostics-panel__head">
        <AlertTriangle size={22} className="diagnostics-panel__icon" aria-hidden />
        <div>
          <h3 id="app-error-journal-title" className="diagnostics-panel__title">
            Журнал ошибок и диагностика
          </h3>
          <p className="muted diagnostics-panel__sub">
            Состояние устройства, очередь sync и подсказки по сбоям
          </p>
        </div>
      </div>

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
          <div>
            <dt>Страница</dt>
            <dd className="diagnostics-state-grid__mono">{system.pathname}</dd>
          </div>
          <div>
            <dt>Приложение</dt>
            <dd>v{system.appVersion}</dd>
          </div>
          <div>
            <dt>Ошибок / очередь</dt>
            <dd>
              <span className={errorCount > 0 ? 'diagnostics-warn' : 'diagnostics-ok'}>{errorCount}</span>
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
              {queue.length === 1 ? 'запись ждёт отправки' : queue.length < 5 ? 'записи ждут отправки' : 'записей ждут отправки'}
              . Нажмите Sync в шапке.
            </p>
            <ol className="diagnostics-panel__queue-list">
              {queuePreview.map((item, i) => (
                <li key={item.local_id ?? i}>{formatSyncQueueLine(item, i)}</li>
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
                  {row.detail ? <div className="app-error-journal__detail">{row.detail}</div> : null}
                  {hint ? (
                    <div className="diagnostics-panel__hint" role="note">
                      <strong>Подсказка:</strong> {hint}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="row diagnostics-panel__actions">
        <button type="button" className="btn btn-primary diagnostics-panel__copy" disabled={copyBusy} onClick={() => void handleCopy()}>
          <ClipboardCopy size={16} aria-hidden />
          {copyBusy ? 'Копирование…' : 'Скопировать отчёт'}
        </button>
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
