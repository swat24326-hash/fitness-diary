import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Repeat, Save, X } from 'lucide-react'
import { trainerScheduleLocalActions } from '../../lib/trainer/trainerScheduleLocalActions.js'
import {
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
} from '../../lib/trainer/trainerScheduleTrainingCore.js'
import { normalizeScheduleTimeInput } from '../../lib/trainer/trainerScheduleCore.js'
import { listScheduleFollowingSiblings } from '../../lib/trainer/trainerScheduleRecurrenceCore.js'
import { TrainerScheduleTrainingStart } from './TrainerScheduleTrainingStart.jsx'
import { useScheduleEntryForm } from '../../hooks/useScheduleEntryForm.js'
import { useScheduleModalViewport } from '../../hooks/useScheduleModalViewport.js'
import { TrainerScheduleEntryReadonly } from './TrainerScheduleEntryReadonly.jsx'
import { TrainerScheduleRepeatFields } from './TrainerScheduleRepeatFields.jsx'
import { TrainerScheduleKindPicker } from './TrainerScheduleKindPicker.jsx'
import { TrainerScheduleDirectionField } from './TrainerScheduleDirectionField.jsx'
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
 *   azDirections?: Array<{ id: string, name: string }>,
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
  azDirections = [],
  actions = trainerScheduleLocalActions,
  canStartTraining = true,
  onClose,
  onSaved,
}) {
  const form = useScheduleEntryForm({ open, draft, dayIso, entries, clientNameById, azDirections })
  const { mode, selectedIds, repeat } = form
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [deleteAsk, setDeleteAsk] = useState(false)
  /** @type {'kind' | 'note' | 'repeat' | null} */
  const [extra, setExtra] = useState(/** @type {'kind' | 'note' | 'repeat' | null} */ (null))
  /** Пока ищем клиента — время свёрнуто в одну строку (место списку под клавиатуру). */
  const [timeCollapsed, setTimeCollapsed] = useState(false)
  const { overlayStyle, panelStyle } = useScheduleModalViewport(open)
  const editing = !draft?.id || editingId === draft.id
  const followingSiblings = useMemo(
    () => (draft?.id ? listScheduleFollowingSiblings(entries, draft) : []),
    [draft, entries],
  )
  const noteText = String(form.title ?? '').trim()
  useEffect(() => {
    setError('')
    setDeleteAsk(false)
    setExtra(null)
    setTimeCollapsed(false)
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
  const toggleExtra = (id) => setExtra((cur) => (cur === id ? null : id))

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
    <div
      className="trainer-schedule-modal"
      role="presentation"
      style={overlayStyle}
      onClick={onClose}
    >
      <div
        className="trainer-schedule-modal__panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trainer-schedule-modal-title"
        style={panelStyle}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="trainer-schedule-modal__head">
          <h2 id="trainer-schedule-modal-title" className="sr-only">
            {draft?.id ? 'Запись' : 'Новая запись'}
          </h2>
          <div className="trainer-schedule-modal__head-kind">
            <TrainerScheduleKindPicker
              value={form.kind}
              onChange={form.pickKind}
              menuOpen={extra === 'kind'}
              onOpenChange={(v) => setExtra(v ? 'kind' : null)}
            />
          </div>
          <div className="trainer-schedule-modal__head-actions">
            {deleteAsk ? null : (
              <button
                type="submit"
                form="trainer-schedule-entry-form"
                className="btn btn-icon-square btn-primary trainer-schedule-modal__save"
                disabled={busy}
                data-testid="schedule-save"
                aria-label="Сохранить"
                title="Сохранить"
              >
                <Save size={18} aria-hidden />
              </button>
            )}
            <button type="button" className="btn btn-icon-square btn-secondary" onClick={onClose} aria-label="Закрыть">
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>

        {error ? (
          <p className="trainer-schedule-modal__error trainer-schedule-modal__error--top" role="alert">
            {error}
          </p>
        ) : null}

        {/* noValidate: Safari/iPhone иначе тихо блокирует submit (time/required) — без нашей ошибки на русском. */}
        <form
          id="trainer-schedule-entry-form"
          className={`trainer-schedule-modal__form${timeCollapsed ? ' trainer-schedule-modal__form--time-collapsed' : ''}`}
          onSubmit={onSubmit}
          noValidate
        >
          <div className="trainer-schedule-modal__form-top">
            {timeCollapsed ? (
              <button
                type="button"
                className="trainer-schedule-modal__time-summary"
                data-testid="schedule-time-summary"
                onClick={() => setTimeCollapsed(false)}
              >
                <span>
                  {form.time || '—'} · {form.duration || '—'} мин
                  {form.endLabel ? ` · до ${form.endLabel}` : ''}
                </span>
                <span className="muted">изменить</span>
              </button>
            ) : (
              <div className="trainer-schedule-modal__row trainer-schedule-modal__row--compact">
                <label className="trainer-schedule-modal__field">
                  <span>Время</span>
                  <input
                    className="input"
                    type="time"
                    step={60}
                    value={form.time}
                    onChange={(ev) => form.setTime(normalizeScheduleTimeInput(ev.target.value))}
                    onFocus={() => setExtra(null)}
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
                      onFocus={(ev) => {
                        setExtra(null)
                        ev.target.select()
                      }}
                      aria-label="Длительность в минутах"
                      data-testid="schedule-duration"
                    />
                    <span className="trainer-schedule-modal__duration-unit" aria-hidden>
                      мин
                    </span>
                  </span>
                  {form.endLabel ? (
                    <small className="trainer-schedule-modal__duration-hint" data-testid="schedule-end-hint">
                      до {form.endLabel}
                    </small>
                  ) : null}
                </label>
              </div>
            )}

            {timeCollapsed ? null : (
              <TrainerScheduleDirectionField
                kind={form.kind}
                value={form.directionTypeId}
                onChange={form.setDirectionTypeId}
                options={azDirections}
              />
            )}

            {!timeCollapsed && form.formMode === 'either' ? (
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
                onSearchFocus={() => {
                  setExtra(null)
                  setTimeCollapsed(true)
                }}
              />
            ) : (
              <label className="trainer-schedule-modal__field trainer-schedule-modal__field--wide">
                <span>Текст</span>
                <textarea
                  className="textarea"
                  value={form.title}
                  onChange={(ev) => form.setTitle(ev.target.value)}
                  rows={4}
                  placeholder="Например: обед, созвон, подготовка зала"
                  maxLength={240}
                />
              </label>
            )}
          </div>

          <div className="trainer-schedule-modal__form-foot">
            {mode === 'clients' && extra === 'note' ? (
              <label className="trainer-schedule-modal__field trainer-schedule-modal__field--note-aside">
                <span className="sr-only">Примечание, необязательно</span>
                <input
                  className="input"
                  type="text"
                  value={form.title}
                  onChange={(ev) => form.setTitle(ev.target.value)}
                  placeholder="Примечание (необязательно)"
                  maxLength={240}
                  data-testid="schedule-note-aside"
                  autoFocus
                />
              </label>
            ) : null}

            {extra === 'repeat' ? (
              <TrainerScheduleRepeatFields
                enabled={repeat.on}
                onToggle={repeat.setOn}
                weekdays={repeat.weekdays}
                onWeekdays={repeat.setWeekdays}
                weeks={repeat.weeks}
                onWeeks={repeat.setWeeks}
                plan={repeat.plan}
              />
            ) : null}

            <div className="trainer-schedule-modal__more" role="toolbar" aria-label="Дополнительно">
              {mode === 'clients' ? (
                <button
                  type="button"
                  className={`trainer-schedule-modal__more-btn${noteText || extra === 'note' ? ' trainer-schedule-modal__more-btn--on' : ''}`}
                  aria-pressed={extra === 'note'}
                  data-testid="schedule-note-toggle"
                  onClick={() => {
                    setTimeCollapsed(false)
                    toggleExtra('note')
                  }}
                >
                  <FileText size={14} aria-hidden />
                  Примечание{noteText ? ' · есть' : ''}
                </button>
              ) : null}
              <button
                type="button"
                className={`trainer-schedule-modal__more-btn${repeat.on || extra === 'repeat' ? ' trainer-schedule-modal__more-btn--on' : ''}`}
                aria-pressed={extra === 'repeat'}
                data-testid="schedule-repeat-toggle"
                onClick={() => {
                  setTimeCollapsed(false)
                  toggleExtra('repeat')
                }}
              >
                <Repeat size={14} aria-hidden />
                Повтор{repeat.on ? ' · вкл' : ''}
              </button>
            </div>

            {trainingChip ? (
              <p className="trainer-schedule-modal__preview muted">
                <span className="trainer-schedule-modal__chip">{trainingChip}</span>
              </p>
            ) : null}

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

            {deleteChoice}

            {deleteAsk || !draft?.id ? null : (
              <div className="trainer-schedule-modal__actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-danger-outline"
                  disabled={busy}
                  onClick={() => setDeleteAsk(true)}
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
