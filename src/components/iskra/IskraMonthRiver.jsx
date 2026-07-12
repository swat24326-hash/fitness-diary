/**
 * Лента дней отчётов месяца.
 * @param {{ river: { cells: Array<{ day: number, state: string }>, label: string, tone?: string } | null }} props
 */
export function IskraMonthRiver({ river }) {
  if (!river?.cells?.length) return null
  const preview = river.cells.length > 24 ? river.cells.slice(0, 24) : river.cells

  return (
    <div className={`iskra-month-river iskra-month-river--${river.tone || 'neutral'}`} aria-label={river.label}>
      <div className="iskra-month-river__head">
        <span className="iskra-month-river__title">Отчёты</span>
        <span className="iskra-month-river__label">{river.label}</span>
      </div>
      <div className="iskra-month-river__cells" aria-hidden>
        {preview.map((cell) => (
          <span
            key={cell.day}
            className={`iskra-month-river__cell iskra-month-river__cell--${cell.state}`}
            title={`День ${cell.day}`}
          />
        ))}
        {river.cells.length > preview.length ? (
          <span className="iskra-month-river__more">+{river.cells.length - preview.length}</span>
        ) : null}
      </div>
    </div>
  )
}
