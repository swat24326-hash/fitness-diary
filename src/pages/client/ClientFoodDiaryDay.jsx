import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  FOOD_DIARY_MEALS,
  foodDiaryAddableMealKeys,
  foodDiaryMealLabel,
  foodDiaryNextAddableMealKey,
  foodDiaryVisibleMealKeys,
  groupFoodDiaryByMeal,
  shiftIsoDate,
} from '../../lib/client/foodDiaryDayCore.js'
import { ClientFoodDiarySummary } from './ClientFoodDiarySummary.jsx'
import { ClientFoodDiaryWater } from './ClientFoodDiaryWater.jsx'

function formatDayLabel(iso) {
  try {
    const d = new Date(`${iso}T12:00:00`)
    return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
  } catch {
    return iso
  }
}

function EntryRow({ entry, onEdit }) {
  return (
    <button type="button" className="food-diary-entry-row btn-touch" onClick={() => onEdit(entry)}>
      <span className="food-diary-entry-row__name">{entry.name}</span>
      <span className="food-diary-entry-row__meta muted">
        {entry.grams != null ? `${entry.grams} г · ` : ''}
        {Math.round(entry.kcal)} ккал
      </span>
    </button>
  )
}

/**
 * Вкладка «День»: дата, вода, приёмы по кнопке / из рациона, итог.
 */
export function ClientFoodDiaryDay({
  asOf,
  entryDate,
  entries = [],
  waterMl = 0,
  busy = false,
  error = '',
  targets,
  onDateChange,
  onAdd,
  onEdit,
  onWaterChange,
}) {
  const byMeal = groupFoodDiaryByMeal(entries)
  const canNext = entryDate < asOf
  const [openMealKeys, setOpenMealKeys] = useState([])

  useEffect(() => {
    setOpenMealKeys([])
  }, [entryDate])

  const visibleKeys = foodDiaryVisibleMealKeys(entries, openMealKeys)
  const addable = foodDiaryAddableMealKeys(visibleKeys)
  const nextMeal = foodDiaryNextAddableMealKey(visibleKeys)
  const mealMeta = Object.fromEntries(FOOD_DIARY_MEALS.map((m) => [m.key, m]))

  function handleAddMeal() {
    if (!nextMeal || busy) return
    setOpenMealKeys((prev) => (prev.includes(nextMeal) ? prev : [...prev, nextMeal]))
  }

  return (
    <div className={`food-diary-day${visibleKeys.length === 0 ? ' food-diary-day--empty' : ''}`}>
      <div className="food-diary-day__nav">
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch"
          aria-label="Предыдущий день"
          disabled={busy}
          onClick={() => onDateChange(shiftIsoDate(entryDate, -1))}
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <div className="food-diary-day__date">
          <span className="food-diary-day__date-label">{formatDayLabel(entryDate)}</span>
          {entryDate === asOf ? <span className="muted food-diary-day__today">сегодня</span> : null}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch"
          aria-label="Следующий день"
          disabled={busy || !canNext}
          onClick={() => onDateChange(shiftIsoDate(entryDate, 1))}
        >
          <ChevronRight size={22} aria-hidden />
        </button>
      </div>

      <ClientFoodDiaryWater ml={waterMl} busy={busy} onChange={onWaterChange} variant="row" />

      {error ? (
        <p className="food-diary-day__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="food-diary-meals">
        {visibleKeys.map((key) => {
          const list = byMeal[key] ?? []
          const label = mealMeta[key]?.label ?? foodDiaryMealLabel(key)
          return (
            <section key={key} className="food-diary-meal card" aria-labelledby={`food-meal-${key}`}>
              <header className="food-diary-meal__head">
                <h2 id={`food-meal-${key}`} className="food-diary-meal__title">
                  {label}
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square btn-touch"
                  aria-label={`Добавить в ${label}`}
                  disabled={busy}
                  onClick={() => onAdd(key)}
                >
                  <Plus size={20} aria-hidden />
                </button>
              </header>
              {list.length === 0 ? null : (
                <ul className="food-diary-meal__list">
                  {list.map((e) => (
                    <li key={e.id}>
                      <EntryRow entry={e} onEdit={onEdit} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {addable.length > 0 ? (
        <button
          type="button"
          className="btn btn-primary btn-touch food-diary-day__add"
          disabled={busy || !nextMeal}
          onClick={handleAddMeal}
        >
          <Plus size={18} aria-hidden />
          Добавить приём пищи
        </button>
      ) : null}

      <ClientFoodDiarySummary entries={entries} targets={targets} variant="compact" />
    </div>
  )
}
