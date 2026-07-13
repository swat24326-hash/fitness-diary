import { useEffect, useMemo, useState } from 'react'
import { Send, Sparkles, X } from 'lucide-react'
import { buildDispatchFromInsightCard } from '../../lib/admin/iskraDispatchCore.js'
import { createIskraDispatch } from '../../lib/admin/iskraDispatchService.js'
import { buildManualTaskDraft, staffTaskSourceChannelLabel } from '../../lib/admin/staffTaskCreateCore.js'
import { periodLabelRu } from '../../lib/admin/geminiAnalyticsSnapshot.js'
import { ISKRA_TASK_KIND_META } from '../../lib/admin/iskraTaskKindsCore.js'
import {
  buildSelectedRecipientIds,
  dispatchRecipientSendLabel,
} from '../../lib/admin/iskraDispatchRecipientCore.js'
import { dispatchDueDateMinIso, isValidFutureDueDate, resolveDispatchDueAt } from '../../lib/admin/iskraDispatchDueCore.js'
import { DispatchRecipientPicker } from './DispatchRecipientPicker.jsx'
import { DispatchDuePicker } from './DispatchDuePicker.jsx'
import { isValidCustomRecurrenceDays } from '../../lib/admin/iskraDispatchRecurrenceCore.js'
import { DispatchRecurrencePicker } from './DispatchRecurrencePicker.jsx'
import { DispatchStagesEditor } from './DispatchStagesEditor.jsx'

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
      recurrence_preset: '',
      context_json: {},
    }
  }, [defaultDraft, defaultCard, clubName, periodLabel, manualMode])

  const draftChannelLabel = staffTaskSourceChannelLabel(draft.source_channel ?? '')
  const taskKind = String(draft.task_kind ?? 'custom')

  const [recipientMode, setRecipientMode] = useState('one')
  const [singleRecipientId, setSingleRecipientId] = useState('')
  const [multiRecipientIds, setMultiRecipientIds] = useState([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [dueMode, setDueMode] = useState('3days')
  const [dueDate, setDueDate] = useState(dispatchDueDateMinIso())
  const [recurrencePreset, setRecurrencePreset] = useState('')
  const [customRecurrenceDays, setCustomRecurrenceDays] = useState(7)
  const [stageTitles, setStageTitles] = useState([])
  const [priority, setPriority] = useState('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    if (!open) return
    const defaultId = defaultRecipientId || draft.default_recipient_id || recipientOptions[0]?.trainer_id || ''
    const preset = String(draft.due_preset ?? '3days')
    const resolvedDue = resolveDispatchDueAt({ due_preset: preset })
    let nextDueMode = resolvedDue.due_mode
    if (preset === 'week') nextDueMode = '3days'
    if (!['tomorrow', '3days', 'none', 'date'].includes(nextDueMode)) nextDueMode = '3days'

    setRecipientMode('one')
    setSingleRecipientId(defaultId)
    setMultiRecipientIds(defaultId ? [defaultId] : [])
    setTitle(draft.title)
    setBody(draft.body)
    setDueMode(nextDueMode)
    setDueDate(resolvedDue.due_date || dispatchDueDateMinIso())
    setRecurrencePreset(String(draft.recurrence_preset ?? ''))
    setCustomRecurrenceDays(Number(draft.recurrence_days) || 7)
    setStageTitles(Array.isArray(draft.stage_titles) ? draft.stage_titles : [])
    setPriority(draft.priority ?? 'normal')
    setError('')
    setOkMsg('')
  }, [open, draft, defaultRecipientId, recipientOptions])

  const selectedRecipientIds = useMemo(
    () =>
      buildSelectedRecipientIds(recipientMode, {
        singleId: singleRecipientId,
        multiIds: multiRecipientIds,
        options: recipientOptions,
      }),
    [recipientMode, singleRecipientId, multiRecipientIds, recipientOptions],
  )

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
      setError(
        recipientMode === 'several' && !selectedRecipientIds.length
          ? 'Выберите хотя бы одного исполнителя'
          : 'Выберите исполнителя и заполните текст',
      )
      return
    }

    if (dueMode === 'date' && !isValidFutureDueDate(dueDate)) {
      setError('Укажите дату дедлайна — сегодня или позже')
      return
    }

    if (recurrencePreset && dueMode === 'none') {
      setError('Для повторяющегося задания нужен срок — не «Без срока»')
      return
    }

    if (recurrencePreset === 'custom_days' && !isValidCustomRecurrenceDays(customRecurrenceDays)) {
      setError('Укажите интервал повтора от 2 до 90 дней')
      return
    }

    const stagesToSend = stageTitles.map((s) => String(s).trim()).filter(Boolean)
    if (stageTitles.length > 0 && stagesToSend.length !== stageTitles.length) {
      setError('Заполните все этапы или удалите пустые строки')
      return
    }

    setBusy(true)
    setError('')
    try {
      const duePreset = dueMode === 'date' ? 'date' : dueMode
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
        dueDate: dueMode === 'date' ? dueDate : undefined,
        recurrencePreset,
        recurrenceDays: recurrencePreset === 'custom_days' ? customRecurrenceDays : undefined,
        stages: stagesToSend.length ? stagesToSend : undefined,
        deepLink: draft.deep_link || ISKRA_TASK_KIND_META[taskKind]?.deepLink,
      })
      const count = Number(result?.count) || selectedRecipientIds.length
      const recurNote = recurrencePreset ? ' · цикл запущен' : ''
      setOkMsg(
        count > 1 ? `Задание поставлено ${count} сотрудникам${recurNote}` : `Задание поставлено${recurNote}`,
      )
      onSent?.()
      window.setTimeout(() => onClose(), 700)
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось отправить')
    } finally {
      setBusy(false)
    }
  }

  const sendLabel = dispatchRecipientSendLabel(
    recipientMode,
    selectedRecipientIds.length,
    recipientOptions.length,
  )

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
                    : 'Планёрка: кому, срок, текст'}
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        <div className="iskra-dispatch__body">
          <div className="iskra-dispatch__section">
            <span className="iskra-dispatch__section-label">Исполнитель</span>
            <DispatchRecipientPicker
              mode={recipientMode}
              onModeChange={setRecipientMode}
              options={recipientOptions}
              singleId={singleRecipientId}
              onSingleIdChange={setSingleRecipientId}
              multiIds={multiRecipientIds}
              onMultiIdsChange={setMultiRecipientIds}
              disabled={busy}
            />
          </div>

          <div className="iskra-dispatch__section">
            <span className="iskra-dispatch__section-label">Срок и повтор</span>
            <DispatchDuePicker
              mode={dueMode}
              onModeChange={setDueMode}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              disabled={busy}
            />
            <DispatchRecurrencePicker
              preset={recurrencePreset}
              onPresetChange={setRecurrencePreset}
              customDays={customRecurrenceDays}
              onCustomDaysChange={setCustomRecurrenceDays}
              dueMode={dueMode}
              disabled={busy}
            />
          </div>

          <div className="iskra-dispatch__section">
            <DispatchStagesEditor stages={stageTitles} onChange={setStageTitles} disabled={busy} />
          </div>

          <label className="iskra-dispatch__field">
            <span>Приоритет</span>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={busy}>
              <option value="normal">Обычный</option>
              <option value="high">Высокий</option>
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
            {busy ? 'Отправка…' : sendLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
