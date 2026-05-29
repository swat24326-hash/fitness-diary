import { formatDateRu } from '../lib/dateRu'

/**
 * @param {{ byDay: Array<{ date: string, completed?: number, draft?: number }>, maxDayTotal: number }} props
 */
export function AdminClubDayChart({ byDay, maxDayTotal }) {
  if (!byDay.length) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Нет тренировок в выбранном диапазоне.
      </p>
    )
  }

  return (
    <div
      className="admin-club-day-chart"
      style={{
        maxHeight: 280,
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      {byDay.map((d) => {
        const sum = (d.completed ?? 0) + (d.draft ?? 0)
        const pct = maxDayTotal ? Math.min(100, Math.round((sum / maxDayTotal) * 100)) : 0
        return (
          <div key={d.date} className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: 12, width: 88, flexShrink: 0 }}>
              {formatDateRu(d.date)}
            </span>
            <div
              className="u-grow u-minw-0"
              style={{
                height: 12,
                borderRadius: 6,
                background: 'var(--border)',
                overflow: 'hidden',
              }}
              title={`Завершено: ${d.completed}, черновики: ${d.draft}`}
            >
              <div
                style={{
                  display: 'flex',
                  width: `${Math.max(pct, sum ? 2 : 0)}%`,
                  height: '100%',
                  minWidth: sum ? 4 : 0,
                }}
              >
                {d.completed > 0 ? (
                  <div style={{ flex: d.completed, background: 'var(--accent)', minWidth: d.completed ? 2 : 0 }} />
                ) : null}
                {d.draft > 0 ? (
                  <div
                    style={{
                      flex: d.draft,
                      background: 'var(--text-muted)',
                      opacity: 0.8,
                      minWidth: d.draft ? 2 : 0,
                    }}
                  />
                ) : null}
              </div>
            </div>
            <span className="muted" style={{ fontSize: 12, width: 52, textAlign: 'right', flexShrink: 0 }}>
              {sum}
            </span>
          </div>
        )
      })}
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
        Зелёный — завершённые, серый — черновики.
      </p>
    </div>
  )
}
