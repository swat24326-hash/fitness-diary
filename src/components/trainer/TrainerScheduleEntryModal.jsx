import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Play, Trash2, X } from 'lucide-react'
import {
  SCHEDULE_DEFAULT_DURATION_MIN,
  buildScheduleEntryLabel,
  formatScheduleMinutes,
  normalizeScheduleClientIds,
  parseScheduleTimeToMinutes,
} from '../../lib/trainer/trainerScheduleCore.js'
import {
  deleteTrainerScheduleEntry,
  saveTrainerScheduleEntry,
  saveTrainerScheduleEntryCopies,
} from '../../lib/trainer/trainerScheduleService.js'
import {
  buildScheduleWorkoutNewPath,
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
} from '../../lib/trainer/trainerScheduleTrainingCore.js'
import {
  SCHEDULE_REPEAT_DEFAULT_WEEKS,
  planScheduleRepeatCopies,
  scheduleWeekdayIndex,
} from '../../lib/trainer/trainerScheduleRecurrenceCore.js'
import {
  SCHEDULE_KIND_TRAINING,
  resolveScheduleEntryKind,
  scheduleKindFormMode,
  scheduleKindRequiresClients,
} from '../../lib/trainer/trainerScheduleKindCore.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import { TrainerScheduleEntryReadonly } from './TrainerScheduleEntryReadonly.jsx'
import { TrainerScheduleRepeatFields } from './TrainerScheduleRepeatFields.jsx'
import { TrainerScheduleKindPicker } from './TrainerScheduleKindPicker.jsx'
import { TrainerScheduleClientPicker } from './TrainerScheduleClientPicker.jsx'

const DURATIONS = [30, 60, 90, 120]

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
 *   onClose: () => void,
 *   onSaved: (result?: { repeated: number }) => void,
 * }} props
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
  onClose,
  onSaved,
}) {
  const nav = useNavigate()
  const [mode, setMode] = useState('clients')
  const [kind, setKind] = useState('personal')
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(SCHEDULE_DEFAULT_DURATION_MIN)
  const [title, setTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState(/** @type {string[]} */ ([]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [repeatOn, setRepeatOn] = useState(false)
  const [repeatWeekdays, setRepeatWeekdays] = useState(/** @type {number[]} */ ([]))
  const [repeatWeeks, setRepeatWeeks] = useState(SCHEDULE_REPEAT_DEFAULT_WEEKS)

  useEffect(() => {
    if (!open) return
    const entry = draft
    const ids = normalizeScheduleClientIds(entry?.client_ids)
    const nextKind = entry?.id ? resolveScheduleEntryKind(entry) : SCHEDULE_KIND_TRAINING
    const nextFormMode = scheduleKindFormMode(nextKind)
    setKind(nextKind)
    setMode(nextFormMode !== 'either' ? nextFormMode : ids.length ? 'clients' : 'note')
    setTime(formatScheduleMinutes(Number(entry?.start_minutes ?? 10 * 60)))
    setDuration(Number(entry?.duration_minutes) || SCHEDULE_DEFAULT_DURATION_MIN)
    setTitle(String(entry?.title ?? ''))
    setSelectedIds(ids)
    setError('')
    setRepeatOn(false)
    const wd = scheduleWeekdayIndex(dayIso)
    setRepeatWeekdays(wd >= 0 ? [wd] : [])
    setRepeatWeeks(SCHEDULE_REPEAT_DEFAULT_WEEKS)
  }, [open, draft])

  const repeatPlan = useMemo(() => {
    if (!repeatOn) return { days: [], skipped: 0 }
    return planScheduleRepeatCopies(
      { startDayIso: dayIso, weekdays: repeatWeekdays, weeks: repeatWeeks, todayIso: todayInTimeZoneIso() },
      {
        start_minutes: parseScheduleTimeToMinutes(time) ?? -1,
        client_ids: mode === 'clients' ? selectedIds : [],
        title: mode === 'note' ? title : '',
      },
      entries,
    )
  }, [repeatOn, dayIso, repeatWeekdays, repeatWeeks, time, mode, selectedIds, title, entries])

  const formMode = scheduleKindFormMode(kind)

  const pickKind = (next) => {
    setKind(next)
    const nextMode = scheduleKindFormMode(next)
    if (nextMode !== 'either') setMode(nextMode)
  }

  const singleClientId = selectedIds.length === 1 ? selectedIds[0] : null

  const previewLabel = useMemo(() => {
    if (mode === 'note') return title.trim() || 'Заметка'
    return buildScheduleEntryLabel({ client_ids: selectedIds, title: '' }, clientNameById)
  }, [mode, title, selectedIds, clientNameById])

  const trainingStart = useMemo(() => {
    if (!draft?.id && !open) return { kind: 'none' }
    const base = {
      id: draft?.id,
      day_date: dayIso,
      client_ids: mode === 'clients' ? selectedIds : [],
      linked_training_id: draft?.linked_training_id ?? null,
    }
    return resolveScheduleTrainingStart(base, { trainingById, workoutsBase: '/trainer/workouts' })
  }, [draft, dayIso, mode, selectedIds, trainingById, open])

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

  const toggleClient = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const startMinutes = parseScheduleTimeToMinutes(time)
    if (startMinutes == null) {
      setError('Укажите время в формате ЧЧ:ММ')
      return
    }
    const client_ids = mode === 'clients' ? selectedIds : []
    const note = mode === 'note' ? title.trim() : ''
    if (scheduleKindRequiresClients(kind) && !client_ids.length) {
      setError('Для тренировки выберите клиента')
      return
    }
    if (!client_ids.length && !note) {
      setError('Напишите заметку или выберите клиента')
      return
    }
    setBusy(true)
    try {
      const res = await saveTrainerScheduleEntry({
        id: draft?.id,
        club_id: clubId,
        trainer_id: trainerId,
        day_date: dayIso,
        start_minutes: startMinutes,
        duration_minutes: duration,
        title: note,
        client_ids,
        linked_training_id: draft?.linked_training_id ?? null,
        kind,
      })
      if (!res.ok) {
        setError(res.error ?? 'Не удалось сохранить')
        return
      }
      let repeated = 0
      if (repeatOn && repeatPlan.days.length) {
        const copies = await saveTrainerScheduleEntryCopies(res.entry, repeatPlan.days)
        repeated = copies.created
        if (!copies.ok) {
          onSaved({ repeated })
          setError(`Создано копий: ${repeated} из ${repeatPlan.days.length}. ${copies.error ?? ''}`.trim())
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
      await deleteTrainerScheduleEntry(draft.id)
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
              <input type="time" value={time} onChange={(ev) => setTime(ev.target.value)} required />
            </label>
            <label className="trainer-schedule-modal__field">
              <span>Длительность</span>
              <select value={duration} onChange={(ev) => setDuration(Number(ev.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} мин
                  </option>
                ))}
              </select>
            </label>
          </div>

          <TrainerScheduleKindPicker value={kind} onChange={pickKind} />

          {formMode === 'either' ? (
            <div className="trainer-schedule-modal__modes" role="tablist" aria-label="Тип записи">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'note'}
                className={mode === 'note' ? 'trainer-schedule-modal__mode trainer-schedule-modal__mode--active' : 'trainer-schedule-modal__mode'}
                onClick={() => setMode('note')}
              >
                Заметка
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'clients'}
                className={mode === 'clients' ? 'trainer-schedule-modal__mode trainer-schedule-modal__mode--active' : 'trainer-schedule-modal__mode'}
                onClick={() => setMode('clients')}
              >
                Клиенты
              </button>
            </div>
          ) : null}

          {mode === 'note' ? (
            <label className="trainer-schedule-modal__field trainer-schedule-modal__field--wide">
              <span>Текст</span>
              <textarea
                value={title}
                onChange={(ev) => setTitle(ev.target.value)}
                rows={3}
                placeholder="Например: обед, созвон, подготовка зала"
                maxLength={240}
              />
            </label>
          ) : (
            <TrainerScheduleClientPicker clients={clients} selectedIds={selectedIds} onToggle={toggleClient} />
          )}

          <TrainerScheduleRepeatFields
            enabled={repeatOn}
            onToggle={setRepeatOn}
            weekdays={repeatWeekdays}
            onWeekdays={setRepeatWeekdays}
            weeks={repeatWeeks}
            onWeeks={setRepeatWeeks}
            plan={repeatPlan}
          />

          <p className="trainer-schedule-modal__preview muted">
            Будет: <strong>{previewLabel}</strong>
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
