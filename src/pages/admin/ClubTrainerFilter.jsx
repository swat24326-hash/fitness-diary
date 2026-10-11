/**
 * Тренер для ежедневников клуба — ряд «таблеток» в один клик вместо выпадающего списка.
 * @param {{ trainers: { id: string, name?: string }[], value: string, onChange: (id: string) => void, loading?: boolean }} props
 */
export function ClubTrainerFilter({ trainers, value, onChange, loading = false }) {
  const sorted = [...trainers].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
  const options = [{ id: '', name: 'Все тренеры' }, ...sorted]

  return (
    <div className="club-trainer-filter" role="radiogroup" aria-label="Тренер">
      {options.map((t) => {
        const active = String(t.id) === value
        return (
          <button
            key={t.id || 'all'}
            type="button"
            role="radio"
            aria-checked={active}
            className={['club-trainer-filter__chip', active ? 'club-trainer-filter__chip--active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(String(t.id))}
          >
            {t.name || 'Тренер'}
          </button>
        )
      })}
      {loading ? <span className="club-trainer-filter__loading muted">Загрузка тренеров…</span> : null}
    </div>
  )
}
