/**
 * Составная полоса зон + компактная легенда (Garmin-раскладка, наши %).
 * @param {{
 *   rows: Array<{
 *     key: 'easy'|'mid'|'hard',
 *     title: string,
 *     method_pct: string,
 *     bpm_range: string,
 *     is_target: boolean,
 *   }>,
 *   zonePct: { easy: number, mid: number, hard: number },
 * }} props
 */
export function TrainingHrZoneStack({ rows, zonePct }) {
  if (!Array.isArray(rows) || rows.length === 0) return null

  const segments = rows
    .map((row) => ({ ...row, pct: Math.max(0, Math.min(100, Number(zonePct?.[row.key]) || 0)) }))
    .filter((row) => row.pct > 0)

  return (
    <div className="hr-zone-stack hr-zone-stack--minimal" aria-label="Зоны ЧСС по методике">
      <div className="hr-zone-stack__bar" role="img" aria-label="Доля времени по зонам">
        {segments.map((row) => (
          <span
            key={row.key}
            className={`hr-zone-stack__seg hr-zone-stack__seg--${row.key}`}
            style={{ flexGrow: row.pct, flexBasis: 0 }}
            title={`${row.title}: ${row.pct}%`}
          />
        ))}
        {segments.length === 0 ? <span className="hr-zone-stack__seg hr-zone-stack__seg--empty" /> : null}
      </div>

      <ul className="hr-zone-stack__legend">
        {rows.map((row) => {
          const pct = Math.max(0, Math.min(100, Number(zonePct?.[row.key]) || 0))
          return (
            <li
              key={row.key}
              className={`hr-zone-stack__row${row.is_target ? ' hr-zone-stack__row--target' : ''}`}
            >
              <span className={`hr-zone-stack__dot hr-zone-stack__dot--${row.key}`} aria-hidden />
              <span className="hr-zone-stack__name">
                {row.title}
                {row.is_target ? <span className="hr-zone-stack__badge">цель</span> : null}
              </span>
              <span className="hr-zone-stack__right">
                <span className="hr-zone-stack__pct">{pct}%</span>
                <span className="hr-zone-stack__bpm">
                  {row.bpm_range} · {row.method_pct}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
