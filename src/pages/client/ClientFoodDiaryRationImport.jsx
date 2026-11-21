import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { foodDiaryPlanMealOptions } from '../../lib/client/foodDiaryFromPlanCore.js'
import { clientNutritionDayView } from '../../lib/client/clientNutritionDayCore.js'

/**
 * Полноэкранная шторка: рацион под ней не кликается (Пн–Вс не переключить).
 * Пустой приём — добавить, занятый — заменить.
 */
export function ClientFoodDiaryRationImport({
  planPayload,
  dayIndex = 0,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const options = foodDiaryPlanMealOptions(planPayload, dayIndex)
  const day = clientNutritionDayView(planPayload, dayIndex)
  const dayLabel = day.spoken || day.short || ''
  const [selected, setSelected] = useState(() => options.map((o) => o.key))

  useEffect(() => {
    setSelected(foodDiaryPlanMealOptions(planPayload, dayIndex).map((o) => o.key))
  }, [planPayload, dayIndex])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const toggle = (key) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const canGo = selected.length > 0 && options.some((o) => selected.includes(o.key))

  const sheet = (
    <div className="food-diary-ration-import" role="dialog" aria-modal="true" aria-label="Что перенести в дневник">
      <button
        type="button"
        className="food-diary-ration-import__backdrop"
        aria-label="Закрыть"
        disabled={busy}
        onClick={onCancel}
      />
      <div className="food-diary-ration-import__panel">
        <h3 className="food-diary-ration__conflict-title">
          Какие приёмы записать?
          {dayLabel ? <span className="muted food-diary-ration-import__day"> · {dayLabel}</span> : null}
        </h3>
        <div className="food-diary-ration__meal-picks" role="group" aria-label="Приёмы пищи">
          {options.map((o) => {
            const on = selected.includes(o.key)
            return (
              <button
                key={o.key}
                type="button"
                className={`food-diary-ration__meal-pick btn-touch${on ? ' food-diary-ration__meal-pick--on' : ''}`}
                aria-pressed={on}
                disabled={busy}
                onClick={() => toggle(o.key)}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        <p className="muted food-diary-ration__hint">
          Берётся день рациона, который был открыт до окна. Пустой приём заполнится, занятый — заменится.
        </p>
        <div className="food-diary-ration__conflict-actions">
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={busy || !canGo}
            onClick={() => onConfirm?.({ mode: 'replace', mealKeys: selected })}
          >
            Записать в дневник
          </button>
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}
