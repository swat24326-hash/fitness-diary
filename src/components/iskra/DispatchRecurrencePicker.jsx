import { CalendarRange, Repeat } from 'lucide-react'
import {
  DISPATCH_RECURRENCE_CUSTOM_DAYS_MAX,
  DISPATCH_RECURRENCE_CUSTOM_DAYS_MIN,
  DISPATCH_RECURRENCE_INTERVAL_PRESETS,
  formatRecurrenceDaysRu,
  isRecurringDispatchPreset,
  isValidCustomRecurrenceDays,
} from '../../lib/admin/iskraDispatchRecurrenceCore.js'

const DEFAULT_INTERVAL_PRESET = 'weekly'

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
  const isInterval = isRecurringDispatchPreset(preset)
  const needsDue = isInterval && dueMode === 'none'
  const customInvalid = preset === 'custom_days' && !isValidCustomRecurrenceDays(customDays)

  const selectOnce = () => onPresetChange('')

  const selectInterval = () => {
    if (!isInterval) onPresetChange(DEFAULT_INTERVAL_PRESET)
  }

  return (
    <div className="iskra-dispatch__recurrence">
      <p className="iskra-dispatch__sub-label">
        <Repeat size={14} aria-hidden />
        Повтор задания
      </p>

      <div className="iskra-dispatch__recurrence-kind" role="group" aria-label="Тип задания">
        <button
          type="button"
          className={`iskra-dispatch__recurrence-kind-btn${!isInterval ? ' iskra-dispatch__recurrence-kind-btn--on' : ''}`}
          disabled={disabled}
          onClick={selectOnce}
        >
          Разовое
        </button>
        <button
          type="button"
          className={`iskra-dispatch__recurrence-kind-btn${isInterval ? ' iskra-dispatch__recurrence-kind-btn--on' : ''}`}
          disabled={disabled}
          onClick={selectInterval}
        >
          По интервалу
        </button>
      </div>

      {!isInterval ? (
        <p className="iskra-dispatch__recurrence-once-hint muted">
          Задание выполняется один раз — без автоматического следующего цикла.
        </p>
      ) : (
        <div className="iskra-dispatch__recurrence-panel" role="region" aria-label="Настройка интервала">
          <p className="iskra-dispatch__recurrence-panel-title">
            <CalendarRange size={14} aria-hidden />
            Как часто повторять
          </p>
          <div className="iskra-dispatch__recurrence-mode" role="group" aria-label="Интервал повтора">
            {DISPATCH_RECURRENCE_INTERVAL_PRESETS.map((opt) => (
              <button
                key={opt.id}
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

          <p className="iskra-dispatch__recurrence-note muted">
            После «Выполнено» автоматически появится следующий цикл с новым сроком.
          </p>
        </div>
      )}

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
