import { CalendarDays } from 'lucide-react'
import {
  DISPATCH_DUE_MODE_OPTIONS,
  dispatchDueDateMinIso,
  isValidFutureDueDate,
} from '../../lib/admin/iskraDispatchDueCore.js'

/**
 * @param {{
 *   mode: string,
 *   onModeChange: (mode: string) => void,
 *   dueDate: string,
 *   onDueDateChange: (iso: string) => void,
 *   disabled?: boolean,
 * }} props
 */
export function DispatchDuePicker({ mode, onModeChange, dueDate, onDueDateChange, disabled = false }) {
  const minDate = dispatchDueDateMinIso()
  const dateInvalid = mode === 'date' && dueDate && !isValidFutureDueDate(dueDate)

  return (
    <div className="iskra-dispatch__due">
      <p className="iskra-dispatch__sub-label">
        <CalendarDays size={14} aria-hidden />
        Дедлайн
      </p>
      <div className="iskra-dispatch__due-mode" role="group" aria-label="Дедлайн">
        {DISPATCH_DUE_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`iskra-dispatch__due-mode-btn${mode === opt.id ? ' iskra-dispatch__due-mode-btn--on' : ''}`}
            disabled={disabled}
            onClick={() => onModeChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'date' ? (
        <label className="iskra-dispatch__due-date">
          <span className="iskra-dispatch__due-date-label">
            <CalendarDays size={14} aria-hidden style={{ verticalAlign: -2, marginRight: 4 }} />
            Выберите дату
          </span>
          <input
            type="date"
            className="input"
            value={dueDate}
            min={minDate}
            disabled={disabled}
            onChange={(e) => onDueDateChange(e.target.value)}
          />
          {dateInvalid ? (
            <span className="iskra-dispatch__due-date-hint iskra-dispatch__due-date-hint--error">
              Укажите сегодня или дату в будущем
            </span>
          ) : (
            <span className="iskra-dispatch__due-date-hint muted">Дедлайн — до конца выбранного дня</span>
          )}
        </label>
      ) : null}
    </div>
  )
}
