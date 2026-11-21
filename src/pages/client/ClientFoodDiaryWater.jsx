import {
  FOOD_DIARY_WATER_DEFAULT_TARGET_ML,
  FOOD_DIARY_WATER_STEP_ML,
  clampWaterAdd,
  foodDiaryWaterProgressPct,
} from '../../lib/client/foodDiaryWaterCore.js'

/**
 * Вода за день.
 * @param {'card'|'row'} [variant] — row: одна строка на вкладке «День»
 */
export function ClientFoodDiaryWater({ ml = 0, busy = false, onChange, variant = 'card' }) {
  const pct = foodDiaryWaterProgressPct(ml)
  const add = (delta) => {
    onChange(clampWaterAdd(ml, delta))
  }

  if (variant === 'row') {
    return (
      <div className="food-diary-water food-diary-water--row" aria-label="Вода">
        <span className="food-diary-water__ml">
          Вода {ml} / {FOOD_DIARY_WATER_DEFAULT_TARGET_ML} мл
        </span>
        <div className="food-diary-water__actions">
          <button
            type="button"
            className="btn btn-ghost btn-touch food-diary-water__step"
            disabled={busy || ml <= 0}
            aria-label={`Убрать ${FOOD_DIARY_WATER_STEP_ML} мл`}
            onClick={() => add(-FOOD_DIARY_WATER_STEP_ML)}
          >
            −
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch food-diary-water__step"
            disabled={busy}
            aria-label={`Добавить ${FOOD_DIARY_WATER_STEP_ML} мл`}
            onClick={() => add(FOOD_DIARY_WATER_STEP_ML)}
          >
            +{FOOD_DIARY_WATER_STEP_ML}
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className="food-diary-water card" aria-label="Вода">
      <header className="food-diary-water__head">
        <h2 className="food-diary-water__title">Вода</h2>
        <span className="food-diary-water__ml">
          {ml} / {FOOD_DIARY_WATER_DEFAULT_TARGET_ML} мл
        </span>
      </header>
      <div className="food-diary-water__bar" aria-hidden>
        <div className="food-diary-water__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="food-diary-water__actions">
        <button
          type="button"
          className="btn btn-ghost btn-touch"
          disabled={busy || ml <= 0}
          onClick={() => add(-FOOD_DIARY_WATER_STEP_ML)}
        >
          −{FOOD_DIARY_WATER_STEP_ML}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-touch"
          disabled={busy}
          onClick={() => add(FOOD_DIARY_WATER_STEP_ML)}
        >
          +{FOOD_DIARY_WATER_STEP_ML} мл
        </button>
      </div>
    </section>
  )
}
