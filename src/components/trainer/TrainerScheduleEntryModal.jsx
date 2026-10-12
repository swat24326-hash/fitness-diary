import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Play, Trash2, X } from 'lucide-react'
import { trainerScheduleLocalActions } from '../../lib/trainer/trainerScheduleLocalActions.js'
import {
  buildScheduleWorkoutNewPath,
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
} from '../../lib/trainer/trainerScheduleTrainingCore.js'
import { useScheduleEntryForm } from '../../hooks/useScheduleEntryForm.js'
import { TrainerScheduleEntryReadonly } from './TrainerScheduleEntryReadonly.jsx'
import { TrainerScheduleRepeatFields } from './TrainerScheduleRepeatFields.jsx'
import { TrainerScheduleKindPicker } from './TrainerScheduleKindPicker.jsx'
import { TrainerScheduleClientPicker } from './TrainerScheduleClientPicker.jsx'

/**
 * @param {{
 *   open: boolean,
 *   draft: object | null,
 *   dayIso: string,
 *   clubId: string,
 *   trainerId: string,
 *   clients: object[],
 *   clientNameById?: Record<string, string>,
 *   trainerNameById?: Record<string, string>,
 *   trainingById?: Record<string, object>,
 *   readOnly?: boolean,
 *   clientsBase?: string,
 *   entries?: object[],
 *   actions?: typeof trainerScheduleLocalActions,
 *   canStartTraining?: boolean,
 *   onClose: () => void,
 *   onSaved: (result?: { repeated: number }) => void,
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
  const nav = useNavigate()
  const form = useScheduleEntryForm({ open, draft, dayIso, entries, clientNameById })
  const { mode, selectedIds, repeat } = form
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) setError('')
  }, [open, draft])

  const trainingStart = useMemo(() => {
    if (!canStartTraining || (!draft?.id && !open)) return { kind: 'none' }
    const base = {
      id: draft?.id,
      day_date: dayIso,
      client_ids: mode === 'clients' ? selectedIds : [],
      linked_training_id: draft?.linked_training_id ?? null,
    }
    return resolveScheduleTrainingStart(base, { trainingById, workoutsBase: '/trainer/workouts' })
  }, [canStartTraining, draft, dayIso, mode, selectedIds, trainingById, open])

  const linkedTraining = draft?.linked_training_id ? trainingById[draft.linked_training_id] : null
  const trainingChip = scheduleEntryTrainingStatusLabel(
    { linked_training_id: draft?.linked_training_id },
    linkedTraining,
  )

  if (!open) return null

  if (readOnly && draft) {
    return (
      <TrainerScheduleEntryReadonly
        draft={draft}
        trainerName={trainerNameById[String(draft?.trainer_id ?? trainerId ?? '')] ?? ''}
        clientNameById={clientNameById}
        clientsBase={clientsBase}
        trainingChip={trainingChip}
        onClose={onClose}
      />
    )
  }

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
      onSaved({ repeated })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!draft?.id) return
    if (!window.confirm('Удалить запись из расписания?')) return
    setBusy(true)
    try {
      const res = await actions.remove(draft)
      if (res && !res.ok) {
        setError(res.error ?? 'Не удалось удалить')
        return
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
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

        <form className="trainer-schedule-modal__form" onSubmit={onSubmit}>
          <div className="trainer-schedule-modal__row">
            <label className="trainer-schedule-modal__field">
              <span>Время</span>
              <input className="input" type="time" value={form.time} onChange={(ev) => form.setTime(ev.target.value)} required />
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

          {mode === 'note' ? (
            <label className="trainer-schedule-modal__field trainer-schedule-modal__field--wide">
              <span>Текст</span>
              <textarea
                className="textarea"
                value={form.title}
                onChange={(ev) => form.setTitle(ev.target.value)}
                rows={3}
                placeholder="Например: обед, созвон, подготовка зала"
                maxLength={240}
              />
            </label>
          ) : (
            <TrainerScheduleClientPicker clients={clients} selectedIds={selectedIds} onToggle={form.toggleClient} />
          )}

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

          {trainingStart.kind === 'open' || trainingStart.kind === 'new' ? (
            <button
              type="button"
              className="btn btn-primary trainer-schedule-modal__start"
              onClick={() => nav(trainingStart.path)}
            >
              <Play size={16} aria-hidden />
              {trainingStart.label}
            </button>
          ) : null}

          {trainingStart.kind === 'pick_client' ? (
            <div className="trainer-schedule-modal__pick-clients">
              <p className="trainer-schedule-modal__hint muted">С кого начать тренировку?</p>
              <ul className="trainer-schedule-modal__pick-list">
                {trainingStart.clientIds.map((cid) => (
                  <li key={cid}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        nav(
                          buildScheduleWorkoutNewPath(
                            cid,
                            trainingStart.dayDate,
                            trainingStart.scheduleEntryId,
                            trainingStart.workoutsBase,
                          ),
                        )
                      }
                    >
                      {clientNameById[cid] ?? 'Клиент'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {singleClientId ? (
            <p className="trainer-schedule-modal__link-row">
              <Link to={`/trainer/clients/${singleClientId}`} className="u-no-decoration">
                Открыть карточку клиента
              </Link>
            </p>
          ) : null}

          {error ? (
            <p className="trainer-schedule-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="trainer-schedule-modal__actions">
            {draft?.id ? (
              <button type="button" className="btn btn-secondary btn-danger-outline" disabled={busy} onClick={() => void onDelete()}>
                <Trash2 size={16} aria-hidden />
                Удалить
              </button>
            ) : (
              <span />
            )}
            <div className="trainer-schedule-modal__actions-right">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
