import { Repeat } from 'lucide-react'
import {
  DISPATCH_RECURRENCE_CUSTOM_DAYS_MAX,
  DISPATCH_RECURRENCE_CUSTOM_DAYS_MIN,
  DISPATCH_RECURRENCE_PRESETS,
  formatRecurrenceDaysRu,
  isValidCustomRecurrenceDays,
} from '../../lib/admin/iskraDispatchRecurrenceCore.js'

/**
 * @param {{
 *   preset: string,
 *   onPresetChange: (preset: string) => void,
 *   customDays: number,
 *   onCustomDaysChange: (days: number) => void,
 *   dueMode: string,
 *   disabled?: boolean,
 * }} props
 */
export function DispatchRecurrencePicker({
  preset,
  onPresetChange,
  customDays,
  onCustomDaysChange,
  dueMode,
  disabled = false,
}) {
  const needsDue = !!preset && dueMode === 'none'
  const customInvalid = preset === 'custom_days' && !isValidCustomRecurrenceDays(customDays)

  return (
    <div className="iskra-dispatch__recurrence">
      <p className="iskra-dispatch__sub-label">
        <Repeat size={14} aria-hidden />
        Повтор задания
      </p>
      <div className="iskra-dispatch__recurrence-mode" role="group" aria-label="Повтор задания">
        {DISPATCH_RECURRENCE_PRESETS.map((opt) => (
          <button
            key={opt.id || 'once'}
            type="button"
            className={`iskra-dispatch__recurrence-btn${preset === opt.id ? ' iskra-dispatch__recurrence-btn--on' : ''}`}
            disabled={disabled}
            onClick={() => onPresetChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {preset === 'custom_days' ? (
        <label className="iskra-dispatch__recurrence-custom">
          <span>Каждые</span>
          <input
            type="number"
            className="input iskra-dispatch__recurrence-custom-input"
            min={DISPATCH_RECURRENCE_CUSTOM_DAYS_MIN}
            max={DISPATCH_RECURRENCE_CUSTOM_DAYS_MAX}
            value={customDays}
            disabled={disabled}
            onChange={(e) => onCustomDaysChange(Math.trunc(Number(e.target.value) || 0))}
          />
          <span>дней</span>
          {isValidCustomRecurrenceDays(customDays) ? (
            <span className="muted iskra-dispatch__recurrence-custom-hint">
              → {formatRecurrenceDaysRu(customDays)}
            </span>
          ) : null}
        </label>
      ) : null}

      {preset ? (
        <p className="iskra-dispatch__recurrence-note muted">
          После «Выполнено» автоматически появится следующий цикл с новым сроком.
        </p>
      ) : null}
      {needsDue ? (
        <p className="iskra-dispatch__recurrence-warn" role="alert">
          Для повторяющегося задания выберите срок — не «Без срока».
        </p>
      ) : null}
      {customInvalid ? (
        <p className="iskra-dispatch__recurrence-warn" role="alert">
          Интервал: от {DISPATCH_RECURRENCE_CUSTOM_DAYS_MIN} до {DISPATCH_RECURRENCE_CUSTOM_DAYS_MAX} дней.
        </p>
      ) : null}
    </div>
  )
}
