import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, ClipboardList, ListOrdered, Send, Sparkles, UserRound, X } from 'lucide-react'
import { buildDispatchFromInsightCard } from '../../lib/admin/iskraDispatchCore.js'
import { createIskraDispatch } from '../../lib/admin/iskraDispatchService.js'
import { buildManualTaskDraft, staffTaskSourceChannelLabel } from '../../lib/admin/staffTaskCreateCore.js'
import { periodLabelRu } from '../../lib/admin/geminiAnalyticsSnapshot.js'
import { ISKRA_TASK_KIND_META } from '../../lib/admin/iskraTaskKindsCore.js'
import {
  buildSelectedRecipientIds,
  dispatchRecipientSendLabel,
} from '../../lib/admin/iskraDispatchRecipientCore.js'
import { dispatchDueDateMinIso, dispatchDueModeLabel, isValidFutureDueDate, resolveDispatchDueAt } from '../../lib/admin/iskraDispatchDueCore.js'
import { DispatchRecipientPicker } from './DispatchRecipientPicker.jsx'
import { DispatchDuePicker } from './DispatchDuePicker.jsx'
import { isValidCustomRecurrenceDays, DISPATCH_RECURRENCE_PRESETS, formatRecurrenceDaysRu } from '../../lib/admin/iskraDispatchRecurrenceCore.js'
import { DispatchRecurrencePicker } from './DispatchRecurrencePicker.jsx'
import { DispatchStagesEditor } from './DispatchStagesEditor.jsx'
import '../../styles/iskra-dispatch.css'

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
 *   baselineMetrics?: {
 *     planPct?: number,
 *     profitTotal?: number,
 *     impactRub?: number | null,
 *   } | null,
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
  baselineMetrics = null,
  onSent,
}) {
  const recipientOptions = recipients ?? trainers
  const periodLabel = year && month ? periodLabelRu(year, month) : 'месяц'
  const draft = useMemo(() => {
    if (defaultDraft) return defaultDraft
    if (defaultCard) {
      return buildDispatchFromInsightCard(defaultCard, {
        clubName,
        periodLabel,
        planPct: baselineMetrics?.planPct,
        profitTotal: baselineMetrics?.profitTotal,
        impactRub: baselineMetrics?.impactRub ?? defaultCard?.impactRub ?? null,
        year,
        month,
      })
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
  }, [defaultDraft, defaultCard, clubName, periodLabel, manualMode, baselineMetrics, year, month])

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

  const handleRecurrenceChange = (nextPreset) => {
    setRecurrencePreset(nextPreset)
    if (nextPreset && dueMode === 'none') setDueMode('3days')
  }

  const composePreview = useMemo(() => {
    let who = '—'
    if (recipientMode === 'all') who = `все (${recipientOptions.length})`
    else if (recipientMode === 'several') who = `${selectedRecipientIds.length} чел.`
    else {
      const hit = recipientOptions.find((t) => t.trainer_id === singleRecipientId)
      who = hit?.trainer_name || hit?.role_label || '—'
    }

    let when = dispatchDueModeLabel(dueMode)
    if (dueMode === 'date' && dueDate) when = `до ${dueDate.split('-').reverse().join('.')}`

    let recur = ''
    if (recurrencePreset) {
      const hit = DISPATCH_RECURRENCE_PRESETS.find((p) => p.id === recurrencePreset)
      recur =
        recurrencePreset === 'custom_days' && isValidCustomRecurrenceDays(customRecurrenceDays)
          ? formatRecurrenceDaysRu(customRecurrenceDays)
          : hit?.label || ''
    }

    const stagesCount = stageTitles.map((s) => String(s).trim()).filter(Boolean).length
    const stagesWord =
      stagesCount === 1 ? '1 этап' : stagesCount >= 2 && stagesCount <= 4 ? `${stagesCount} этапа` : stagesCount >= 5 ? `${stagesCount} этапов` : ''
    const parts = [who, when]
    if (recur) parts.push(recur)
    if (stagesWord) parts.push(stagesWord)
    return parts.join(' · ')
  }, [
    recipientMode,
    recipientOptions,
    selectedRecipientIds.length,
    singleRecipientId,
    dueMode,
    dueDate,
    recurrencePreset,
    customRecurrenceDays,
    stageTitles,
  ])

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
          : 'Заполните заголовок, описание и выберите исполнителя',
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

  const flowStep = !title.trim() || !body.trim() ? 1 : !selectedRecipientIds.length ? 2 : 3

  return (
    <div
      className="modal-overlay modal-overlay--center iskra-dispatch-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="iskra-dispatch-title"
      onClick={() => !busy && onClose()}
    >
      <div className="modal-panel iskra-dispatch" onClick={(e) => e.stopPropagation()}>
        <header className="iskra-dispatch__head">
          <div className="iskra-dispatch__head-main">
            <span className="iskra-dispatch__head-icon" aria-hidden>
              <Sparkles size={20} />
            </span>
            <div>
              <h2 id="iskra-dispatch-title" className="iskra-dispatch__title">
                Поставить задание
              </h2>
              <p className="iskra-dispatch__sub muted">
                {manualMode
                  ? 'Ручное задание без ИСКРЫ'
                  : draft.source_channel
                    ? `Планёрка · ${draftChannelLabel}`
                    : 'Сначала суть, потом кому и срок'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon-square iskra-dispatch__close"
            disabled={busy}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </header>

        <div className="iskra-dispatch__flow" aria-hidden>
          <span className={`iskra-dispatch__flow-step${flowStep >= 1 ? ' iskra-dispatch__flow-step--on' : ''}`}>
            <span className="iskra-dispatch__flow-num">1</span>
            Суть
          </span>
          <span className="iskra-dispatch__flow-line" />
          <span className={`iskra-dispatch__flow-step${flowStep >= 2 ? ' iskra-dispatch__flow-step--on' : ''}`}>
            <span className="iskra-dispatch__flow-num">2</span>
            Кому
          </span>
          <span className="iskra-dispatch__flow-line" />
          <span className={`iskra-dispatch__flow-step${flowStep >= 3 ? ' iskra-dispatch__flow-step--on' : ''}`}>
            <span className="iskra-dispatch__flow-num">3</span>
            Срок
          </span>
        </div>

        <div className="iskra-dispatch__body stagger">
          <section className="iskra-dispatch__block" aria-labelledby="iskra-dispatch-block-task">
            <div className="iskra-dispatch__block-head">
              <h3 id="iskra-dispatch-block-task" className="iskra-dispatch__block-title">
                <ClipboardList size={15} aria-hidden />
                Суть задания
              </h3>
              <span className="iskra-dispatch__block-badge">Шаг 1</span>
            </div>
            <p className="iskra-dispatch__block-hint muted">Что нужно сделать — исполнитель увидит это в инбоксе.</p>

            <label className="iskra-dispatch__field">
              <span>Заголовок</span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Кратко: что сделать"
                disabled={busy}
                autoFocus
              />
            </label>

            <label className="iskra-dispatch__field">
              <span>Описание</span>
              <textarea
                className="input iskra-dispatch__textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Подробности: что, зачем, критерий готовности"
                disabled={busy}
              />
            </label>

            <div className="iskra-dispatch__field">
              <span className="iskra-dispatch__field-label">Приоритет</span>
              <div className="iskra-dispatch__priority" role="group" aria-label="Приоритет">
                <button
                  type="button"
                  className={`iskra-dispatch__priority-btn${priority === 'normal' ? ' iskra-dispatch__priority-btn--on' : ''}`}
                  disabled={busy}
                  onClick={() => setPriority('normal')}
                >
                  Обычный
                </button>
                <button
                  type="button"
                  className={`iskra-dispatch__priority-btn iskra-dispatch__priority-btn--high${priority === 'high' ? ' iskra-dispatch__priority-btn--on' : ''}`}
                  disabled={busy}
                  onClick={() => setPriority('high')}
                >
                  Высокий
                </button>
              </div>
            </div>
          </section>

          <section className="iskra-dispatch__block" aria-labelledby="iskra-dispatch-block-who">
            <div className="iskra-dispatch__block-head">
              <h3 id="iskra-dispatch-block-who" className="iskra-dispatch__block-title">
                <UserRound size={15} aria-hidden />
                Исполнитель
              </h3>
              <span className="iskra-dispatch__block-badge">Шаг 2</span>
            </div>
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
          </section>

          <section className="iskra-dispatch__block" aria-labelledby="iskra-dispatch-block-when">
            <div className="iskra-dispatch__block-head">
              <h3 id="iskra-dispatch-block-when" className="iskra-dispatch__block-title">
                <CalendarClock size={15} aria-hidden />
                Срок и повтор
              </h3>
              <span className="iskra-dispatch__block-badge">Шаг 3</span>
            </div>
            <DispatchDuePicker
              mode={dueMode}
              onModeChange={setDueMode}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              disabled={busy}
            />
            <div className="iskra-dispatch__split" aria-hidden />
            <DispatchRecurrencePicker
              preset={recurrencePreset}
              onPresetChange={handleRecurrenceChange}
              customDays={customRecurrenceDays}
              onCustomDaysChange={setCustomRecurrenceDays}
              dueMode={dueMode}
              disabled={busy}
            />
          </section>

          <section className="iskra-dispatch__block iskra-dispatch__block--optional" aria-labelledby="iskra-dispatch-block-stages">
            <div className="iskra-dispatch__block-head">
              <h3 id="iskra-dispatch-block-stages" className="iskra-dispatch__block-title">
                <ListOrdered size={15} aria-hidden />
                Этапы
              </h3>
              <span className="iskra-dispatch__block-badge">Опционально</span>
            </div>
            <DispatchStagesEditor stages={stageTitles} onChange={setStageTitles} disabled={busy} />
          </section>

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
          {composePreview ? (
            <p className="iskra-dispatch__preview">
              Отправка: <strong>{composePreview}</strong>
            </p>
          ) : null}
          <div className="iskra-dispatch__foot-actions">
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
          </div>
        </footer>
      </div>
    </div>
  )
}
