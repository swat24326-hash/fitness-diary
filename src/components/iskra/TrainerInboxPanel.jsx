import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Inbox, Sparkles, ThumbsUp, X, XCircle } from 'lucide-react'
import { dispatchStatusLabelRu, ISKRA_DISPATCH_ACTIVE_STATUSES } from '../../lib/admin/iskraDispatchCore.js'
import { buildDispatchInboxActions } from '../../lib/admin/iskraDispatchInboxActionsCore.js'
import {
  fetchIskraDispatch,
  markIskraDispatchSeen,
  updateIskraDispatchStatus,
  completeIskraDispatchStage,
} from '../../lib/admin/iskraDispatchService.js'
import { notifyTrainerInboxUpdated } from '../../lib/admin/trainerInboxEvents.js'
import { taskKindLabel } from '../../lib/admin/iskraTaskKindsCore.js'
import { DispatchTaskProgressBar } from './DispatchTaskProgressBar.jsx'
import { DispatchTaskStagesList } from './DispatchTaskStagesList.jsx'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   clubId?: string,
 *   onPendingChange?: (count: number) => void,
 * }} props
 */
export function TrainerInboxPanel({ open, onClose, clubId = '', onPendingChange }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [busyStageId, setBusyStageId] = useState('')
  const [declineId, setDeclineId] = useState('')
  const [declineReply, setDeclineReply] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchIskraDispatch({ clubId: clubId || undefined, view: 'inbox', limit: 40 })
      const list = Array.isArray(data?.items) ? data.items : []
      setItems(list)
      onPendingChange?.(Number(data?.pending_count) || 0)
      notifyTrainerInboxUpdated()

      const pendingIds = list.filter((i) => i.status === 'pending').map((i) => i.id)
      if (pendingIds.length) {
        try {
          await markIskraDispatchSeen({ dispatchIds: pendingIds })
          const refreshed = await fetchIskraDispatch({ clubId: clubId || undefined, view: 'inbox', limit: 40 })
          const next = Array.isArray(refreshed?.items) ? refreshed.items : list
          setItems(next)
          onPendingChange?.(Number(refreshed?.pending_count) || 0)
        } catch {
          /* offline / migration */
        }
      }
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось загрузить задания')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [clubId, onPendingChange])

  useEffect(() => {
    if (!open) return
    void reload()
  }, [open, reload])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busyId) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busyId, onClose])

  const completeStage = async (dispatchId, stageId) => {
    setBusyStageId(stageId)
    setError('')
    try {
      await completeIskraDispatchStage({ dispatchId, stageId })
      await reload()
      notifyTrainerInboxUpdated()
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось отметить этап')
    } finally {
      setBusyStageId('')
    }
  }

  const setStatus = async (id, status, recipientReply = '') => {
    setBusyId(id)
    try {
      await updateIskraDispatchStatus({ dispatchId: id, status, recipientReply })
      setDeclineId('')
      setDeclineReply('')
      await reload()
      notifyTrainerInboxUpdated()
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось обновить статус')
    } finally {
      setBusyId('')
    }
  }

  if (!open) return null

  const active = items.filter((i) => ISKRA_DISPATCH_ACTIVE_STATUSES.includes(i.status))

  return (
    <div
      className="modal-overlay iskra-inbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="iskra-inbox-title"
      onClick={() => !busyId && onClose()}
    >
      <div className="modal-panel iskra-inbox" onClick={(e) => e.stopPropagation()}>
        <header className="iskra-inbox__head">
          <div className="iskra-inbox__head-main">
            <Inbox size={20} aria-hidden />
            <div>
              <h2 id="iskra-inbox-title" className="iskra-inbox__title">
                Планёрка
              </h2>
              <p className="iskra-inbox__sub muted">
                {active.length ? `${active.length} в работе` : 'Задания от руководства и ИСКРЫ'}
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busyId} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className="iskra-inbox__loading muted" aria-busy>
            Загрузка…
          </div>
        ) : null}

        {error ? (
          <p className="iskra-inbox__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="iskra-inbox__list">
          {!loading && !items.length ? (
            <p className="iskra-inbox__empty muted">Пока пусто — руководитель назначит из ИСКРЫ или Планёрки.</p>
          ) : null}
          {items.map((item) => (
            <article
              key={item.id}
              className={`iskra-inbox__card iskra-inbox__card--${item.status}${item.is_overdue ? ' iskra-inbox__card--overdue' : ''}${item.priority === 'high' ? ' iskra-inbox__card--high' : ''}`}
            >
              <div className="iskra-inbox__card-head">
                <Sparkles size={14} aria-hidden />
                <span className="iskra-inbox__card-from">{item.sender_name || 'ИСКРА'}</span>
                {item.task_kind && item.task_kind !== 'custom' ? (
                  <>
                    <span className="iskra-inbox__card-sep" aria-hidden>
                      ·
                    </span>
                    <span className="iskra-inbox__card-kind">{taskKindLabel(item.task_kind)}</span>
                  </>
                ) : null}
                <span className="iskra-inbox__card-status">{dispatchStatusLabelRu(item.status)}</span>
              </div>
              <h3 className="iskra-inbox__card-title">{item.title}</h3>
              <p className="iskra-inbox__card-body">{item.body}</p>
              <DispatchTaskProgressBar progress={item.progress} />
              <DispatchTaskStagesList
                stages={item.stages}
                busyStageId={busyStageId}
                disabled={!!busyId}
                onCompleteStage={
                  ['seen', 'accepted'].includes(item.status)
                    ? (stageId) => void completeStage(item.id, stageId)
                    : undefined
                }
              />
              {item.due_label || item.recurrence_label ? (
                <p className="iskra-inbox__card-due muted">
                  {item.due_label ? `Срок: ${item.due_label}` : 'Без срока'}
                  {item.recurrence_label ? ` · ${item.recurrence_label}` : null}
                </p>
              ) : null}
              {item.recipient_reply ? (
                <p className="iskra-inbox__card-reply muted">Ваш ответ: {item.recipient_reply}</p>
              ) : null}

              {ISKRA_DISPATCH_ACTIVE_STATUSES.includes(item.status) ? (
                (() => {
                  const actions = buildDispatchInboxActions(item)
                  return (
                    <div className="iskra-inbox__card-actions">
                      {actions.stepHint ? (
                        <p className="iskra-inbox__card-step muted">{actions.stepHint}</p>
                      ) : null}
                      {actions.primary ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === item.id}
                          onClick={() => void setStatus(item.id, actions.primary.action)}
                        >
                          {actions.primary.action === 'accepted' ? (
                            <ThumbsUp size={14} aria-hidden style={{ marginRight: 4, verticalAlign: -2 }} />
                          ) : (
                            <Check size={14} aria-hidden style={{ marginRight: 4, verticalAlign: -2 }} />
                          )}
                          {actions.primary.label}
                        </button>
                      ) : null}
                      {actions.deepLink ? (
                        <Link to={item.deep_link} className="btn btn-secondary btn-sm" onClick={onClose}>
                          Перейти к делу
                        </Link>
                      ) : null}
                      {declineId === item.id ? (
                        <div className="iskra-inbox__decline">
                          <input
                            className="input"
                            placeholder="Почему не могу (необязательно)"
                            value={declineReply}
                            onChange={(e) => setDeclineReply(e.target.value)}
                            maxLength={500}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busyId === item.id}
                            onClick={() => void setStatus(item.id, 'declined', declineReply)}
                          >
                            Отправить
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busyId === item.id}
                            onClick={() => setDeclineId('')}
                          >
                            Отмена
                          </button>
                        </div>
                      ) : actions.canDecline ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busyId === item.id}
                          onClick={() => {
                            setDeclineId(item.id)
                            setDeclineReply('')
                          }}
                        >
                          <XCircle size={14} aria-hidden style={{ marginRight: 4, verticalAlign: -2 }} />
                          Не могу
                        </button>
                      ) : null}
                    </div>
                  )
                })()
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
