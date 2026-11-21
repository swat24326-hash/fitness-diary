/**
 * Сводка за 7 дней. В отчётах — всегда открыта; тап по дню → переход на «День».
 */
export function ClientFoodDiaryWeek({
  week = null,
  busy = false,
  open = false,
  alwaysOpen = false,
  onToggle,
  onPickDay,
}) {
  const shown = alwaysOpen || open

  return (
    <section className="food-diary-week card">
      {!alwaysOpen ? (
        <button
          type="button"
          className="food-diary-week__toggle btn-touch"
          disabled={busy}
          aria-expanded={shown}
          onClick={onToggle}
        >
          <span>Неделя</span>
          <span className="muted">
            {week ? `сред. ${week.avg_kcal || 0} ккал · ${week.days_with_food || 0}/7` : 'показать'}
          </span>
        </button>
      ) : (
        <header className="food-diary-week__head">
          <h2 className="food-diary-week__title">Неделя</h2>
          <span className="muted">
            {week ? `сред. ${week.avg_kcal || 0} ккал · ${week.days_with_food || 0}/7` : '…'}
          </span>
        </header>
      )}
      {shown && week ? (
        <ul className="food-diary-week__days">
          {(week.days ?? []).map((d) => {
            const label = d.entry_date.slice(8)
            const kcal = Math.round(d.totals?.kcal || 0)
            const clickable = typeof onPickDay === 'function'
            const inner = (
              <>
                <span className="muted">{label}</span>
                <span>{kcal || '—'}</span>
              </>
            )
            return (
              <li key={d.entry_date} className="food-diary-week__day">
                {clickable ? (
                  <button
                    type="button"
                    className="food-diary-week__day-btn btn-touch"
                    disabled={busy}
                    onClick={() => onPickDay(d.entry_date)}
                  >
                    {inner}
                  </button>
                ) : (
                  inner
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
