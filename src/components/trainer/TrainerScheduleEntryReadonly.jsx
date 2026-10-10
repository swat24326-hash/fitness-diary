import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { formatScheduleMinutes, normalizeScheduleClientIds } from '../../lib/trainer/trainerScheduleCore.js'
import { resolveScheduleEntryKind, scheduleKindLabel } from '../../lib/trainer/trainerScheduleKindCore.js'

/**
 * Просмотр записи (админ / управляющий) — без редактирования.
 * @param {{
 *   draft: object,
 *   trainerName?: string,
 *   clientNameById?: Record<string, string>,
 *   clientsBase: string,
 *   trainingChip?: string,
 *   onClose: () => void,
 * }} props
 */
export function TrainerScheduleEntryReadonly({ draft, trainerName = '', clientNameById = {}, clientsBase, trainingChip = '', onClose }) {
  const clientIds = normalizeScheduleClientIds(draft?.client_ids)
  const isNote = !clientIds.length
  const kind = resolveScheduleEntryKind(draft)
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
          {trainerName ? (
            <p className="trainer-schedule-modal__readonly-row">
              <span className="muted">Тренер</span>
              <strong>{trainerName}</strong>
            </p>
          ) : null}
          <p className="trainer-schedule-modal__readonly-row">
            <span className="muted">Время</span>
            <strong>
              {formatScheduleMinutes(Number(draft.start_minutes))} · {Number(draft.duration_minutes) || 60} мин
            </strong>
          </p>
          <p className="trainer-schedule-modal__readonly-row">
            <span className="muted">Категория</span>
            <strong className={`trainer-schedule-legend__item trainer-schedule-kind--${kind}`}>
              <span className="trainer-schedule-kinds__dot" aria-hidden />
              {scheduleKindLabel(kind)}
            </strong>
          </p>
          {isNote ? (
            <p className="trainer-schedule-modal__readonly-note">{String(draft.title ?? '').trim() || '—'}</p>
          ) : (
            <ul className="trainer-schedule-modal__readonly-clients">
              {clientIds.map((cid) => (
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
