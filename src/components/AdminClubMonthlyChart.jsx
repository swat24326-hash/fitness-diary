function monthLabelRu(ym) {
  const s = String(ym ?? '')
  const [y, m] = s.split('-')
  const yy = Number(y)
  const mm = Number(m)
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return s
  const d = new Date(yy, mm - 1, 1)
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric' }).format(d)
}

/**
 * @param {{ rows: Array<{ month: string, count: number }> }} props
 */
export function AdminClubMonthlyChart({ rows }) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Нет данных.
      </p>
    )
  }

  let max = 1
  for (const r of list) {
    const n = Number(r?.count ?? 0)
    if (Number.isFinite(n) && n > max) max = n
  }

  return (
    <div className="admin-club-day-chart" style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
      {list.map((r) => {
        const n = Number(r?.count ?? 0) || 0
        const pct = max ? Math.min(100, Math.round((n / max) * 100)) : 0
        return (
          <div key={r.month} className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: 12, width: 110, flexShrink: 0 }}>
              {monthLabelRu(r.month)}
            </span>
            <div
              className="u-grow u-minw-0"
              style={{ height: 12, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}
              title={`${r.month}: ${n}`}
            >
              <div style={{ width: `${Math.max(pct, n ? 2 : 0)}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
            <span className="muted" style={{ fontSize: 12, width: 56, textAlign: 'right', flexShrink: 0 }}>
              {n}
            </span>
          </div>
        )
      })}
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
        Завершённые тренировки со списанием по абонементу, у которого <strong>задан тип карты</strong>. Записи «Без типа» в
        этот итоговый отчёт <strong>не входят</strong> — если все тренировки без типа, график будет нулевым.
      </p>
    </div>
  )
}

