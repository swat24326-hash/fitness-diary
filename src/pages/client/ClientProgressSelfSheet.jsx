/**
 * Шторка: добавить / изменить свой вес или обмеры (○). Легенда ● клуб · ○ я.
 */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { BODY_MEASURE_FIELDS } from '../../lib/bodyMeasures.js'
import {
  parseSelfMeasureValues,
  parseSelfProgressDate,
  parseSelfWeightKg,
} from '../../lib/client/clientProgressSelfCore.js'

/**
 * @param {{
 *   kind: 'weight' | 'measure'
 *   asOf: string
 *   initial?: { id?: string, date?: string, kg?: number, values?: Record<string, number> }
 *   busy?: boolean
 *   error?: string
 *   onClose: () => void
 *   onSave: (payload: object) => void | Promise<void>
 *   onDelete?: () => void | Promise<void>
 * }} props
 */
export function ClientProgressSelfSheet({ kind, asOf, initial, busy = false, error = '', onClose, onSave, onDelete }) {
  const editing = Boolean(initial?.id)
  const [date, setDate] = useState(() => String(initial?.date ?? asOf).slice(0, 10))
  const [kg, setKg] = useState(() => (initial?.kg != null ? String(initial.kg).replace('.', ',') : ''))
  const [values, setValues] = useState(() => {
    const v = { ...(initial?.values ?? {}) }
    const out = {}
    for (const f of BODY_MEASURE_FIELDS) {
      if (v[f.id] != null) out[f.id] = String(v[f.id]).replace('.', ',')
    }
    return out
  })
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    /* Не трогаем body.overflow — на телефоне это мигает стеклом карточек. Скролл ловит шторка. */
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const title = kind === 'weight' ? (editing ? 'Изменить вес' : 'Добавить вес') : editing ? 'Изменить обмеры' : 'Добавить обмеры'

  const submit = async (e) => {
    e.preventDefault()
    setLocalError('')
    const d = parseSelfProgressDate(date, asOf)
    if (!d.ok) {
      setLocalError(d.error)
      return
    }
    if (kind === 'weight') {
      const w = parseSelfWeightKg(kg)
      if (!w.ok) {
        setLocalError(w.error)
        return
      }
      await onSave({ date: d.date, kg: w.kg, id: initial?.id })
      return
    }
    const m = parseSelfMeasureValues(values)
    if (!m.ok) {
      setLocalError(m.error)
      return
    }
    await onSave({ date: d.date, values: m.values, id: initial?.id })
  }

  return (
    <div className="client-progress-self" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="client-progress-self__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="client-progress-self__panel">
        <header className="client-progress-self__head">
          <h2>{title}</h2>
          <button type="button" className="client-progress-self__close btn-touch" aria-label="Закрыть" onClick={onClose}>
            <X size={20} aria-hidden />
          </button>
        </header>
        <p className="client-progress-self__legend">
          <span className="client-progress-self__legend-club">● от клуба</span>
          <span className="client-progress-self__legend-sep" aria-hidden>
            ·
          </span>
          <span className="client-progress-self__legend-me">○ вы внесли — свои можно изменить</span>
        </p>
        <form className="client-progress-self__form" onSubmit={submit}>
          <label className="client-progress-self__field">
            <span>Дата</span>
            <input type="date" value={date} max={asOf} required disabled={busy} onChange={(e) => setDate(e.target.value)} />
          </label>
          {kind === 'weight' ? (
            <label className="client-progress-self__field client-progress-self__field--kg">
              <span>Вес, кг</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                maxLength={6}
                value={kg}
                disabled={busy}
                placeholder="62,5"
                aria-label="Вес, кг"
                onChange={(e) => setKg(e.target.value)}
              />
            </label>
          ) : (
            <div className="client-progress-self__measures" role="group" aria-label="Обмеры в сантиметрах">
              <p className="client-progress-self__unit">Значения в см</p>
              {BODY_MEASURE_FIELDS.map((f) => (
                <label key={f.id} className="client-progress-self__field client-progress-self__field--cm">
                  <span>{f.label}</span>
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="next"
                    maxLength={6}
                    value={values[f.id] ?? ''}
                    disabled={busy}
                    aria-label={`${f.label}, см`}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}
          {localError || error ? (
            <p className="client-progress-self__error" role="alert">
              {localError || error}
            </p>
          ) : null}
          <div className="client-progress-self__actions">
            <button type="submit" className="btn-primary btn-touch" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {editing && onDelete ? (
              <button type="button" className="btn-secondary btn-touch" disabled={busy} onClick={() => onDelete()}>
                Удалить
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}
