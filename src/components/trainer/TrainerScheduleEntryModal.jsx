import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Play, Search, Trash2, X } from 'lucide-react'
import {
  SCHEDULE_DEFAULT_DURATION_MIN,
  buildScheduleEntryLabel,
  buildTrainerScheduleClientPickerList,
  formatScheduleMinutes,
  normalizeScheduleClientIds,
  parseScheduleTimeToMinutes,
} from '../../lib/trainer/trainerScheduleCore.js'
import {
  deleteTrainerScheduleEntry,
  saveTrainerScheduleEntry,
} from '../../lib/trainer/trainerScheduleService.js'
import {
  buildScheduleWorkoutNewPath,
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
} from '../../lib/trainer/trainerScheduleTrainingCore.js'

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
 *   onClose: () => void,
 *   onSaved: () => void,
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
  onClose,
  onSaved,
}) {
  const nav = useNavigate()
  const [mode, setMode] = useState('clients')
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(SCHEDULE_DEFAULT_DURATION_MIN)
  const [title, setTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState(/** @type {string[]} */ ([]))
  const [clientQuery, setClientQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const entry = draft
    const ids = normalizeScheduleClientIds(entry?.client_ids)
    setMode(ids.length ? 'clients' : 'note')
    setTime(formatScheduleMinutes(Number(entry?.start_minutes ?? 10 * 60)))
    setDuration(Number(entry?.duration_minutes) || SCHEDULE_DEFAULT_DURATION_MIN)
    setTitle(String(entry?.title ?? ''))
    setSelectedIds(ids)
    setClientQuery('')
    setError('')
  }, [open, draft])

  const pickerClients = useMemo(
    () => buildTrainerScheduleClientPickerList(clients, clientQuery, selectedIds),
    [clients, clientQuery, selectedIds],
  )

  const clientSearchActive = Boolean(clientQuery.trim())

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

  const viewTrainerName = trainerNameById[String(draft?.trainer_id ?? trainerId ?? '')] ?? ''
  const viewClientIds = normalizeScheduleClientIds(draft?.client_ids)
  const viewIsNote = !viewClientIds.length

  if (readOnly && draft) {
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
              Запись
            </h2>
            <button type="button" className="btn btn-icon-square btn-secondary" onClick={onClose} aria-label="Закрыть">
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="trainer-schedule-modal__readonly">
            {viewTrainerName ? (
              <p className="trainer-schedule-modal__readonly-row">
                <span className="muted">Тренер</span>
                <strong>{viewTrainerName}</strong>
              </p>
            ) : null}
            <p className="trainer-schedule-modal__readonly-row">
              <span className="muted">Время</span>
              <strong>
                {formatScheduleMinutes(Number(draft.start_minutes))} · {Number(draft.duration_minutes) || 60} мин
              </strong>
            </p>
            <p className="trainer-schedule-modal__readonly-row">
              <span className="muted">Тип</span>
              <strong>{viewIsNote ? 'Заметка' : 'Клиенты'}</strong>
            </p>
            {viewIsNote ? (
              <p className="trainer-schedule-modal__readonly-note">{String(draft.title ?? '').trim() || '—'}</p>
            ) : (
              <ul className="trainer-schedule-modal__readonly-clients">
                {viewClientIds.map((cid) => (
                  <li key={cid}>
                    <Link to={`${clientsBase}/${cid}`} className="u-no-decoration">
                      {clientNameById[cid] ?? 'Клиент'}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {trainingChip ? (
              <p className="trainer-schedule-modal__preview muted">
                Статус: <span className="trainer-schedule-modal__chip">{trainingChip}</span>
              </p>
            ) : null}
            <div className="trainer-schedule-modal__actions">
              <span />
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>
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
      })
      if (!res.ok) {
        setError(res.error ?? 'Не удалось сохранить')
        return
      }
      onSaved()
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
            <div className="trainer-schedule-modal__clients-wrap">
              <p className="trainer-schedule-modal__hint muted">Можно выбрать несколько клиентов на один слот.</p>
              <div className="trainer-schedule-modal__search admin-clients-search-cell" role="search">
                <Search size={18} aria-hidden className="muted u-shrink-0" />
                <input
                  className="admin-clients-search-input"
                  type="search"
                  autoComplete="off"
                  placeholder="Фамилия, телефон или номер карты…"
                  aria-label="Поиск клиента"
                  value={clientQuery}
                  onChange={(ev) => setClientQuery(ev.target.value)}
                />
              </div>
              <div className="trainer-schedule-modal__clients">
                <ul className="trainer-schedule-modal__client-list">
                  {pickerClients.map((c) => {
                    const id = String(c.id)
                    const checked = selectedIds.includes(id)
                    return (
                      <li key={id}>
                        <label className="trainer-schedule-modal__client-item">
                          <input type="checkbox" checked={checked} onChange={() => toggleClient(id)} />
                          <span>{c.name}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                {!clients.length ? (
                  <p className="muted">Нет активных клиентов — добавьте заметку или клиента в базе.</p>
                ) : null}
                {clients.length && clientSearchActive && !pickerClients.length ? (
                  <p className="muted trainer-schedule-modal__clients-empty">Никого не найдено — измените запрос.</p>
                ) : null}
              </div>
            </div>
          )}

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
