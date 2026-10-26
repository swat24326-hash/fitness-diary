import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { trainerScheduleLocalActions } from '../../lib/trainer/trainerScheduleLocalActions.js'
import {
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
} from '../../lib/trainer/trainerScheduleTrainingCore.js'
import { normalizeScheduleTimeInput } from '../../lib/trainer/trainerScheduleCore.js'
import { listScheduleFollowingSiblings } from '../../lib/trainer/trainerScheduleRecurrenceCore.js'
import { TrainerScheduleTrainingStart } from './TrainerScheduleTrainingStart.jsx'
import { useScheduleEntryForm } from '../../hooks/useScheduleEntryForm.js'
import { TrainerScheduleEntryReadonly } from './TrainerScheduleEntryReadonly.jsx'
import { TrainerScheduleRepeatFields } from './TrainerScheduleRepeatFields.jsx'
import { TrainerScheduleKindPicker } from './TrainerScheduleKindPicker.jsx'
import { TrainerScheduleClientPicker } from './TrainerScheduleClientPicker.jsx'
import { TrainerScheduleDeleteChoice } from './TrainerScheduleDeleteChoice.jsx'

/**
 * @param {{
 *   open: boolean,
 *   draft: object | null,
 *   dayIso: string,
 *   clubId: string,
 *   trainerId: string,
 *   clients: object[],
 *   clientNameById?: Record<string, string>,
 *   clientInfoById?: Record<string, object>,
 *   trainerNameById?: Record<string, string>,
 *   trainingById?: Record<string, object>,
 *   readOnly?: boolean,
 *   clientsBase?: string,
 *   entries?: object[],
 *   actions?: typeof trainerScheduleLocalActions,
 *   canStartTraining?: boolean,
 *   onClose: () => void,
 *   onSaved: (result?: { repeated: number, prev?: object | null, entry?: object | null }) => void,
 * }} props
 * canStartTraining=false — телефон: без кнопки тренировки и карточки клиента (их нет на личном устройстве).
 */
export function TrainerScheduleEntryModal({
  open,
  draft,
  dayIso,
  clubId,
  trainerId,
  clients,
  clientNameById = {},
  clientInfoById = {},
  trainerNameById = {},
  trainingById = {},
  readOnly = false,
  clientsBase = '/trainer/clients',
  entries = [],
  actions = trainerScheduleLocalActions,
  canStartTraining = true,
  onClose,
  onSaved,
}) {
  const form = useScheduleEntryForm({ open, draft, dayIso, entries, clientNameById })
  const { mode, selectedIds, repeat } = form
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [deleteAsk, setDeleteAsk] = useState(false)
  const editing = !draft?.id || editingId === draft.id
  const followingSiblings = useMemo(
    () => (draft?.id ? listScheduleFollowingSiblings(entries, draft) : []),
    [draft, entries],
  )
  useEffect(() => {
    setError('')
    setDeleteAsk(false)
    if (!open) setEditingId(null)
  }, [open, draft])

  const trainingStart = useMemo(() => {
    if (!canStartTraining || (!draft?.id && !open)) return { kind: 'none' }
    const base = {
      id: draft?.id,
      day_date: dayIso,
      client_ids: !editing ? draft?.client_ids ?? [] : mode === 'clients' ? selectedIds : [],
      linked_training_id: draft?.linked_training_id ?? null,
    }
    return resolveScheduleTrainingStart(base, { trainingById, workoutsBase: '/trainer/workouts' })
  }, [canStartTraining, draft, dayIso, mode, selectedIds, trainingById, open, editing])

  const linkedTraining = draft?.linked_training_id ? trainingById[draft.linked_training_id] : null
  const trainingChip = scheduleEntryTrainingStatusLabel(
    { linked_training_id: draft?.linked_training_id },
    linkedTraining,
  )

  if (!open) return null

  const singleClientId = canStartTraining && selectedIds.length === 1 ? selectedIds[0] : null

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const read = form.readFields()
    if (!read.ok) {
      setError(read.error)
      return
    }
    setBusy(true)
    try {
      const res = await actions.save(
        {
          id: draft?.id,
          club_id: clubId,
          trainer_id: trainerId,
          ...read.fields,
          linked_training_id: draft?.linked_training_id ?? null,
        },
        draft,
      )
      if (!res.ok) {
        setError(res.error ?? 'Не удалось сохранить')
        return
      }
      let repeated = 0
      if (repeat.on && repeat.plan.days.length) {
        const copies = await actions.saveCopies(res.entry, repeat.plan.days)
        repeated = copies.created
        if (!copies.ok) {
          onSaved({ repeated })
          setError(`Создано копий: ${repeated} из ${repeat.plan.days.length}. ${copies.error ?? ''}`.trim())
          return
        }
      }
      onSaved({ repeated, prev: draft?.id ? draft : null, entry: res.entry ?? null })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  /** @param {'one' | 'following'} scope */
  const confirmDelete = async (scope) => {
    if (!draft?.id) return
    setBusy(true)
    setError('')
    try {
      const res = await actions.remove(
        draft,
        scope === 'following' ? { scope: 'following', entries } : { scope: 'one' },
      )
      if (res && !res.ok) {
        setDeleteAsk(false)
        setError(res.error ?? 'Не удалось удалить')
        return
      }
      onSaved()
      onClose()
    } catch (err) {
      setDeleteAsk(false)
      setError(err instanceof Error ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  const deleteChoice =
    deleteAsk && draft?.id ? (
      <TrainerScheduleDeleteChoice
        count={followingSiblings.length}
        busy={busy}
        onOne={() => void confirmDelete('one')}
        onFollowing={() => void confirmDelete('following')}
        onCancel={() => setDeleteAsk(false)}
      />
    ) : null

  if (draft?.id && (readOnly || !editing)) {
    return (
      <TrainerScheduleEntryReadonly
        draft={draft}
        trainerName={readOnly ? trainerNameById[String(draft?.trainer_id ?? trainerId ?? '')] ?? '' : ''}
        clientNameById={clientNameById}
        clientInfoById={clientInfoById}
        clientsBase={readOnly || canStartTraining ? clientsBase : ''}
        trainingChip={trainingChip}
        busy={busy}
        error={error}
        onEdit={readOnly || deleteAsk ? undefined : () => setEditingId(draft.id)}
        onDelete={readOnly || deleteAsk ? undefined : () => setDeleteAsk(true)}
        onClose={onClose}
        footer={deleteChoice}
      >
        {readOnly || deleteAsk ? null : (
          <TrainerScheduleTrainingStart start={trainingStart} clientNameById={clientNameById} />
        )}
      </TrainerScheduleEntryReadonly>
    )
  }

  return (
    <div className="trainer-schedule-modal" role="presentation" onClick={onClose}>
      <div
        className="trainer-schedule-modal__panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trainer-schedule-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="trainer-schedule-modal__head">
          <h2 id="trainer-schedule-modal-title" className="trainer-schedule-modal__title">
            {draft?.id ? 'Запись' : 'Новая запись'}
          </h2>
          <button type="button" className="btn btn-icon-square btn-secondary" onClick={onClose} aria-label="Закрыть">
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* noValidate: Safari/iPhone иначе тихо блокирует submit (time/required) — без нашей ошибки на русском. */}
        <form className="trainer-schedule-modal__form" onSubmit={onSubmit} noValidate>
          <div className="trainer-schedule-modal__form-top">
            <div className="trainer-schedule-modal__row">
              <label className="trainer-schedule-modal__field">
                <span>Время</span>
                <input
                  className="input"
                  type="time"
                  step={60}
                  value={form.time}
                  onChange={(ev) => form.setTime(normalizeScheduleTimeInput(ev.target.value))}
                />
              </label>
              <label className="trainer-schedule-modal__field">
                <span>Длительность</span>
                <span className="trainer-schedule-modal__duration">
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.duration}
                    onChange={(ev) => form.setDuration(ev.target.value)}
                    onFocus={(ev) => ev.target.select()}
                    aria-label="Длительность в минутах"
                    data-testid="schedule-duration"
                  />
                  <span className="trainer-schedule-modal__duration-unit" aria-hidden>
                    мин
                  </span>
                </span>
                <small className="trainer-schedule-modal__duration-hint">{form.endLabel ? `до ${form.endLabel}` : 'от 15 до 480'}</small>
              </label>
            </div>

            <TrainerScheduleKindPicker value={form.kind} onChange={form.pickKind} />

            {form.formMode === 'either' ? (
              <div className="trainer-schedule-modal__modes" role="tablist" aria-label="Тип записи">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'note'}
                  className={mode === 'note' ? 'trainer-schedule-modal__mode trainer-schedule-modal__mode--active' : 'trainer-schedule-modal__mode'}
                  onClick={() => form.setMode('note')}
                >
                  Заметка
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'clients'}
                  className={mode === 'clients' ? 'trainer-schedule-modal__mode trainer-schedule-modal__mode--active' : 'trainer-schedule-modal__mode'}
                  onClick={() => form.setMode('clients')}
                >
                  Клиенты
                </button>
              </div>
            ) : null}
          </div>

          <div className="trainer-schedule-modal__form-body">
            {mode === 'clients' ? (
              <TrainerScheduleClientPicker
                clients={clients}
                selectedIds={selectedIds}
                onToggle={form.toggleClient}
                clientInfoById={clientInfoById}
              />
            ) : null}
            {/* Примечание не сбрасываем при смене категории / вкладки «Клиенты» — текст остаётся в поле. */}
            <label
              className={[
                'trainer-schedule-modal__field',
                'trainer-schedule-modal__field--wide',
                mode === 'clients' ? 'trainer-schedule-modal__field--note-aside' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span>{mode === 'clients' ? 'Примечание, необязательно' : 'Текст'}</span>
              <textarea
                className="textarea"
                value={form.title}
                onChange={(ev) => form.setTitle(ev.target.value)}
                rows={mode === 'clients' ? 2 : 4}
                placeholder={mode === 'clients' ? 'Фокус, зал, пожелание' : 'Например: обед, созвон, подготовка зала'}
                maxLength={240}
              />
            </label>
          </div>

          <div className="trainer-schedule-modal__form-foot">
            <TrainerScheduleRepeatFields
              enabled={repeat.on}
              onToggle={repeat.setOn}
              weekdays={repeat.weekdays}
              onWeekdays={repeat.setWeekdays}
              weeks={repeat.weeks}
              onWeeks={repeat.setWeeks}
              plan={repeat.plan}
            />

            <p className="trainer-schedule-modal__preview muted">
              Будет: <strong>{form.previewLabel}</strong>
              {trainingChip ? <> · <span className="trainer-schedule-modal__chip">{trainingChip}</span></> : null}
            </p>

            {deleteAsk ? null : (
              <TrainerScheduleTrainingStart start={trainingStart} clientNameById={clientNameById} />
            )}

            {deleteAsk || !singleClientId ? null : (
              <p className="trainer-schedule-modal__link-row">
                <Link to={`/trainer/clients/${singleClientId}`} className="u-no-decoration">
                  Открыть карточку клиента
                </Link>
              </p>
            )}

            {error ? (
              <p className="trainer-schedule-modal__error" role="alert">
                {error}
              </p>
            ) : null}

            {deleteChoice}

            {deleteAsk ? null : (
              <div className={`trainer-schedule-modal__actions${draft?.id ? '' : ' trainer-schedule-modal__actions--new'}`}>
                {draft?.id ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-danger-outline"
                    disabled={busy}
                    onClick={() => setDeleteAsk(true)}
                  >
                    Удалить
                  </button>
                ) : null}
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
