/**
 * Шторка параметров цикла в /me (меню профиля).
 * При male / без пола в карте — «Сохранить» бледная и недоступна.
 */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  CYCLE_DEFAULT,
  CYCLE_SEX_BLOCKED_RU,
  clientCanConfigureCycle,
  parseCycleSettingsInput,
  publicClientCycle,
} from '../../lib/client/clientCycleCalendarCore.js'

/**
 * @param {{
 *   asOf: string
 *   sex?: 'male'|'female'|null
 *   initial?: object|null
 *   busy?: boolean
 *   error?: string
 *   onClose: () => void
 *   onSave: (payload: { cycle_days: number, period_days: number, last_period_start: string }) => void | Promise<void>
 *   onDisable?: () => void | Promise<void>
 * }} props
 */
export function ClientCycleSettingsSheet({
  asOf,
  sex = null,
  initial = null,
  busy = false,
  error = '',
  onClose,
  onSave,
  onDisable,
}) {
  const pub = publicClientCycle(initial)
  const canSave = clientCanConfigureCycle(sex)
  const [cycleDays, setCycleDays] = useState(String(pub.cycle_days ?? CYCLE_DEFAULT.cycle_days))
  const [periodDays, setPeriodDays] = useState(String(pub.period_days ?? CYCLE_DEFAULT.period_days))
  const [start, setStart] = useState(String(pub.last_period_start ?? asOf).slice(0, 10))
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async (e) => {
    e.preventDefault()
    setLocalError('')
    if (!canSave) {
      setLocalError(CYCLE_SEX_BLOCKED_RU)
      return
    }
    const parsed = parseCycleSettingsInput(
      {
        enabled: true,
        cycle_days: cycleDays,
        period_days: periodDays,
        last_period_start: start,
      },
      asOf,
    )
    if (!parsed.ok) {
      setLocalError(parsed.error)
      return
    }
    await onSave({
      cycle_days: parsed.value.cycle_days,
      period_days: parsed.value.period_days,
      last_period_start: parsed.value.last_period_start,
    })
  }

  return (
    <div className="client-progress-self" role="dialog" aria-modal="true" aria-label="Параметры цикла">
      <button type="button" className="client-progress-self__backdrop" aria-label="Закрыть" onClick={onClose} disabled={busy} />
      <div className="client-progress-self__panel">
        <div className="client-progress-self__handle" aria-hidden />
        <header className="client-progress-self__head">
          <h2>Цикл</h2>
          <button type="button" className="client-progress-self__close btn-touch" aria-label="Закрыть" onClick={onClose} disabled={busy}>
            <X size={20} aria-hidden />
          </button>
        </header>
        <p className="client-me-muted client-cycle-settings__hint">
          {canSave
            ? 'Упрощённый расчёт по вашим параметрам. Данные видите только вы.'
            : CYCLE_SEX_BLOCKED_RU}
        </p>
        <form className="client-progress-self__form" onSubmit={(e) => void submit(e)}>
          <label className="client-progress-self__field">
            <span>Начало последних месячных</span>
            <input
              type="date"
              value={start}
              max={asOf}
              disabled={busy || !canSave}
              onChange={(e) => setStart(e.target.value)}
              required={canSave}
            />
          </label>
          <label className="client-progress-self__field">
            <span>Длина цикла (дни)</span>
            <input
              type="number"
              inputMode="numeric"
              min={21}
              max={45}
              value={cycleDays}
              disabled={busy || !canSave}
              onChange={(e) => setCycleDays(e.target.value)}
              required={canSave}
            />
          </label>
          <label className="client-progress-self__field">
            <span>Длительность месячных (дни)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              value={periodDays}
              disabled={busy || !canSave}
              onChange={(e) => setPeriodDays(e.target.value)}
              required={canSave}
            />
          </label>
          {localError || error ? (
            <p className="client-onb__error" role="alert">
              {localError || error}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary btn-touch"
            disabled={busy || !canSave}
            title={!canSave ? CYCLE_SEX_BLOCKED_RU : undefined}
          >
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
          {pub.enabled && onDisable ? (
            <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => void onDisable()}>
              Выключить отметку цикла
            </button>
          ) : null}
        </form>
      </div>
    </div>
  )
}
