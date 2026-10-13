import { Link } from 'react-router-dom'
import { Clock, Pencil, StickyNote, Trash2, User, Users, X } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import {
  formatScheduleTimeRange,
  normalizeScheduleClientIds,
  weekdayShortRu,
} from '../../lib/trainer/trainerScheduleCore.js'
import { resolveScheduleEntryKind, scheduleKindLabel } from '../../lib/trainer/trainerScheduleKindCore.js'

/**
 * Просмотр записи, как в Google Календаре: сначала видно, что записано; карандаш — в форму правки.
 * Без onEdit / onDelete — только просмотр (админ / управляющий).
 * @param {{
 *   draft: object,
 *   trainerName?: string,
 *   clientNameById?: Record<string, string>,
 *   clientsBase?: string,
 *   trainingChip?: string,
 *   busy?: boolean,
 *   error?: string,
 *   onEdit?: () => void,
 *   onDelete?: () => void,
 *   onClose: () => void,
 *   children?: import('react').ReactNode,
 * }} props clientsBase пустой — имена без ссылок на карточку (телефон тренера).
 */
export function TrainerScheduleEntryReadonly({
  draft,
  trainerName = '',
  clientNameById = {},
  clientsBase = '',
  trainingChip = '',
  busy = false,
  error = '',
  onEdit,
  onDelete,
  onClose,
  children,
}) {
  const clientIds = normalizeScheduleClientIds(draft?.client_ids)
  const note = String(draft?.title ?? '').trim()
  const kind = resolveScheduleEntryKind(draft)
  const day = String(draft?.day_date ?? '').slice(0, 10)
  return (
    <div className="trainer-schedule-modal" role="presentation" onClick={onClose}>
      <div
        className="trainer-schedule-modal__panel card trainer-schedule-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trainer-schedule-view-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="trainer-schedule-view__tools">
          {onEdit ? (
            <button type="button" className="btn btn-icon-square btn-secondary" onClick={onEdit} disabled={busy} title="Изменить" aria-label="Изменить">
              <Pencil size={18} aria-hidden />
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" className="btn btn-icon-square btn-secondary" onClick={onDelete} disabled={busy} title="Удалить" aria-label="Удалить">
              <Trash2 size={18} aria-hidden />
            </button>
          ) : null}
          <button type="button" className="btn btn-icon-square btn-secondary" onClick={onClose} title="Закрыть" aria-label="Закрыть">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className={`trainer-schedule-view__head trainer-schedule-kind--${kind}`}>
          <span className="trainer-schedule-view__swatch" aria-hidden />
          <div>
            <h2 id="trainer-schedule-view-title" className="trainer-schedule-view__title">
              {weekdayShortRu(day)}, {formatDateRu(day)}
            </h2>
            <p className="trainer-schedule-view__sub">
              <Clock size={14} aria-hidden />
              {formatScheduleTimeRange(draft)} · {Number(draft?.duration_minutes) || 60} мин · {scheduleKindLabel(kind)}
            </p>
          </div>
        </div>

        {trainerName ? (
          <p className="trainer-schedule-view__row">
            <User size={16} aria-hidden className="muted" />
            <span>{trainerName}</span>
          </p>
        ) : null}

        {clientIds.length ? (
          <div className="trainer-schedule-view__row trainer-schedule-view__row--top">
            <Users size={16} aria-hidden className="muted" />
            <div className="trainer-schedule-view__clients">
              <span className="trainer-schedule-view__count muted">
                {clientIds.length === 1 ? 'Клиент' : `Клиентов: ${clientIds.length}`}
              </span>
              <ul className="trainer-schedule-view__client-list">
                {clientIds.map((cid) => (
                  <li key={cid}>
                    {clientsBase ? (
                      <Link to={`${clientsBase}/${cid}`} className="u-no-decoration">
                        {clientNameById[cid] ?? 'Клиент'}
                      </Link>
                    ) : (
                      clientNameById[cid] ?? 'Клиент'
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {note ? (
          <p className="trainer-schedule-view__row trainer-schedule-view__row--top">
            <StickyNote size={16} aria-hidden className="muted" />
            <span className="trainer-schedule-view__note">{note}</span>
          </p>
        ) : null}

        {trainingChip ? (
          <p className="trainer-schedule-modal__preview muted">
            Статус: <span className="trainer-schedule-modal__chip">{trainingChip}</span>
          </p>
        ) : null}

        {children}

        {error ? (
          <p className="trainer-schedule-modal__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
