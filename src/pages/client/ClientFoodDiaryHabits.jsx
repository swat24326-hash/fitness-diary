import { FOOD_DIARY_MEALS, shiftIsoDate } from '../../lib/client/foodDiaryDayCore.js'

/**
 * Часто ем + копировать вчера / приём.
 * @param {boolean} [copyOnly] — только кнопки копии (вкладка «Ещё»)
 */
export function ClientFoodDiaryHabits({
  frequent = [],
  entryDate,
  asOf,
  busy = false,
  onQuickAdd,
  onCopyYesterday,
  onCopyMeal,
  copyOnly = false,
}) {
  const yesterday = shiftIsoDate(entryDate, -1)
  const canCopy = yesterday <= asOf

  return (
    <section className="food-diary-habits" aria-label={copyOnly ? 'Копирование' : 'Быстрые действия'}>
      {!copyOnly && frequent.length > 0 ? (
        <div className="food-diary-habits__freq">
          <p className="food-diary-habits__label muted">Часто ем</p>
          <div className="food-diary-habits__chips">
            {frequent.map((f) => (
              <button
                key={f.name}
                type="button"
                className="food-diary-habits__chip btn-touch"
                disabled={busy}
                onClick={() => onQuickAdd(f)}
              >
                {f.name}
                <span className="muted"> · {Math.round(f.kcal)} ккал</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="food-diary-habits__copy">
        <button
          type="button"
          className="btn btn-ghost btn-touch"
          disabled={busy || !canCopy}
          onClick={() => onCopyYesterday()}
        >
          Скопировать вчера
        </button>
        <label className="food-diary-habits__meal-copy">
          <span className="sr-only">Скопировать приём со вчера</span>
          <select
            disabled={busy || !canCopy}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value
              if (v) {
                onCopyMeal(v)
                e.target.value = ''
              }
            }}
          >
            <option value="">Приём со вчера…</option>
            {FOOD_DIARY_MEALS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}
