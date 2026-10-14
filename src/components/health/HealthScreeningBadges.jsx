/** Метки итога анкеты: красные — допуск, жёлтые — учесть в упражнениях. */
export function HealthScreeningBadges({ badges, max = 0, className = '' }) {
  if (!badges?.length) return null
  const shown = max > 0 ? badges.slice(0, max) : badges
  const rest = badges.length - shown.length
  return (
    <ul className={`hscr-badges ${className}`.trim()} aria-label="Ограничения по здоровью">
      {shown.map((b) => (
        <li key={b.id} className={`hscr-badge hscr-badge--${b.tone}`}>
          {b.text}
        </li>
      ))}
      {rest > 0 ? <li className="hscr-badge hscr-badge--more">+{rest}</li> : null}
    </ul>
  )
}
