import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Send, Sparkles, X } from 'lucide-react'
import { buildDispatchFromInsightCard } from '../../lib/admin/iskraDispatchCore.js'
import { createIskraDispatch } from '../../lib/admin/iskraDispatchService.js'
import { buildManualTaskDraft, staffTaskSourceChannelLabel } from '../../lib/admin/staffTaskCreateCore.js'
import { periodLabelRu } from '../../lib/admin/geminiAnalyticsSnapshot.js'
import { ISKRA_TASK_KIND_META, taskKindLabel } from '../../lib/admin/iskraTaskKindsCore.js'

const DUE_PRESETS = [
  { id: 'tomorrow', label: 'Завтра' },
  { id: '3days', label: '3 дня' },
  { id: 'week', label: 'Неделя' },
  { id: 'none', label: 'Без срока' },
]

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   clubId: string,
 *   clubName?: string,
 *   year?: number,
 *   month?: number,
 *   trainers: Array<{ trainer_id: string, trainer_name?: string, role_label?: string }>,
 *   recipients?: Array<{ trainer_id: string, trainer_name?: string, role_label?: string }>,
 *   defaultCard?: object | null,
 *   defaultDraft?: object | null,
 *   defaultRecipientId?: string,
 *   manualMode?: boolean,
 *   onSent?: () => void,
 * }} props
 */
export function IskraDispatchModal({
  open,
  onClose,
  clubId,
  clubName = '',
  year,
  month,
  trainers = [],
  recipients = null,
  defaultCard = null,
  defaultDraft = null,
  defaultRecipientId = '',
  manualMode = false,
  onSent,
}) {
  const recipientOptions = recipients ?? trainers
  const periodLabel = year && month ? periodLabelRu(year, month) : 'месяц'
  const draft = useMemo(() => {
    if (defaultDraft) return defaultDraft
    if (defaultCard) {
      return buildDispatchFromInsightCard(defaultCard, { clubName, periodLabel })
    }
    if (manualMode) {
      return buildManualTaskDraft()
    }
    return {
      title: '',
      body: '',
      insight_key: '',
      source: 'iskra_manual',
      source_channel: '',
      task_kind: 'custom',
      priority: 'normal',
      due_preset: '3days',
      context_json: {},
    }
  }, [defaultDraft, defaultCard, clubName, periodLabel, manualMode])

  const draftChannelLabel = staffTaskSourceChannelLabel(draft.source_channel ?? '')

  const [recipientIds, setRecipientIds] = useState(() => new Set())
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [duePreset, setDuePreset] = useState('3days')
  const [priority, setPriority] = useState('normal')
  const [taskKind, setTaskKind] = useState('custom')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    if (!open) return
    const defaultId = defaultRecipientId || draft.default_recipient_id || recipientOptions[0]?.trainer_id || ''
    setRecipientIds(defaultId ? new Set([defaultId]) : new Set())
    setTitle(draft.title)
    setBody(draft.body)
    setDuePreset(draft.due_preset ?? '3days')
    setPriority(draft.priority ?? 'normal')
    setTaskKind(draft.task_kind ?? 'custom')
    setError('')
    setOkMsg('')
  }, [open, draft, defaultRecipientId, recipientOptions])

  const toggleRecipient = (id) => {
    setRecipientIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllRecipients = () => {
    setRecipientIds(new Set(recipientOptions.map((t) => t.trainer_id)))
  }

  const selectedRecipientIds = useMemo(() => [...recipientIds], [recipientIds])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const handleSend = async () => {
    if (!clubId || !selectedRecipientIds.length || !title.trim() || !body.trim()) {
      setError('Выберите исполнителей и заполните текст')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await createIskraDispatch({
        clubId,
        recipientUserIds: selectedRecipientIds,
        title: title.trim(),
        body: body.trim(),
        kind: 'task',
        source: draft.source ?? 'iskra_insight',
        sourceChannel: draft.source_channel ?? '',
        contextJson: draft.context_json ?? {},
        insightKey: draft.insight_key ?? defaultCard?.id ?? '',
        periodYear: year,
        periodMonth: month,
        taskKind,
        priority,
        duePreset,
        deepLink: draft.deep_link || ISKRA_TASK_KIND_META[taskKind]?.deepLink,
      })
      const count = Number(result?.count) || selectedRecipientIds.length
      setOkMsg(count > 1 ? `Задание поставлено ${count} сотрудникам` : 'Задание поставлено')
      onSent?.()
      window.setTimeout(() => onClose(), 700)
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось отправить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-overlay iskra-dispatch-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="iskra-dispatch-title"
      onClick={() => !busy && onClose()}
    >
      <div className="modal-panel iskra-dispatch" onClick={(e) => e.stopPropagation()}>
        <header className="iskra-dispatch__head">
          <div className="iskra-dispatch__head-main">
            <Sparkles size={18} aria-hidden />
            <div>
              <h2 id="iskra-dispatch-title" className="iskra-dispatch__title">
                Поставить задание
              </h2>
              <p className="iskra-dispatch__sub muted">
                {manualMode
                  ? 'Ручное задание без ИСКРЫ'
                  : draft.source_channel
                    ? `Планёрка · ${draftChannelLabel}`
                    : 'Планёрка: срок, тип, исполнитель'}
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        <div className="iskra-dispatch__body">
          <fieldset className="iskra-dispatch__field iskra-dispatch__recipients">
            <legend className="iskra-dispatch__recipients-head">
              <span>Исполнители</span>
              {recipientOptions.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm iskra-dispatch__recipients-all"
                  disabled={busy}
                  onClick={selectAllRecipients}
                >
                  Все ({recipientOptions.length})
                </button>
              ) : null}
            </legend>
            {!recipientOptions.length ? (
              <p className="muted iskra-dispatch__recipients-empty">Нет исполнителей в клубе</p>
            ) : (
              <ul className="iskra-dispatch__recipient-list">
                {recipientOptions.map((t) => {
                  const id = t.trainer_id
                  const checked = recipientIds.has(id)
                  return (
                    <li key={id}>
                      <label className={`iskra-dispatch__recipient${checked ? ' iskra-dispatch__recipient--on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => toggleRecipient(id)}
                        />
                        <span>
                          {t.role_label ? `${t.role_label}: ` : ''}
                          {t.trainer_name || id}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            {selectedRecipientIds.length ? (
              <p className="iskra-dispatch__recipients-count muted">
                Выбрано: {selectedRecipientIds.length}
              </p>
            ) : null}
          </fieldset>

          <div className="iskra-dispatch__row">
            <label className="iskra-dispatch__field">
              <span>Тип задания</span>
              <select className="select" value={taskKind} onChange={(e) => setTaskKind(e.target.value)} disabled={busy}>
                {Object.keys(ISKRA_TASK_KIND_META).map((k) => (
                  <option key={k} value={k}>
                    {taskKindLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="iskra-dispatch__field">
              <span>Приоритет</span>
              <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={busy}>
                <option value="normal">Обычный</option>
                <option value="high">Высокий</option>
              </select>
            </label>
          </div>

          <label className="iskra-dispatch__field">
            <span>
              <CalendarClock size={14} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />
              Дедлайн
            </span>
            <select className="select" value={duePreset} onChange={(e) => setDuePreset(e.target.value)} disabled={busy}>
              {DUE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="iskra-dispatch__field">
            <span>Заголовок</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
            />
          </label>

          <label className="iskra-dispatch__field">
            <span>Описание</span>
            <textarea
              className="input iskra-dispatch__textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={2000}
              disabled={busy}
            />
          </label>

          {error ? (
            <p className="iskra-dispatch__feedback iskra-dispatch__feedback--error" role="alert">
              {error}
            </p>
          ) : null}
          {okMsg ? (
            <p className="iskra-dispatch__feedback iskra-dispatch__feedback--ok" role="status">
              {okMsg}
            </p>
          ) : null}
        </div>

        <footer className="iskra-dispatch__foot">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !recipientOptions.length || !selectedRecipientIds.length}
            onClick={() => void handleSend()}
          >
            <Send size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {busy ? 'Отправка…' : 'Поставить задачу'}
          </button>
        </footer>
      </div>
    </div>
  )
}
