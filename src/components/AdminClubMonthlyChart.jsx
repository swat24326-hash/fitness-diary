import { useMemo } from 'react'

function monthLabelRu(ym) {
  const s = String(ym ?? '')
  const [y, m] = s.split('-')
  const yy = Number(y)
  const mm = Number(m)
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return s
  const d = new Date(yy, mm - 1, 1)
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric' }).format(d)
}

function monthLabelShort(ym) {
  const s = String(ym ?? '')
  const [y, m] = s.split('-')
  const yy = Number(y)
  const mm = Number(m)
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return s
  const d = new Date(yy, mm - 1, 1)
  const mon = new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(d).replace('.', '')
  const yr = String(yy).slice(-2)
  return `${mon} ’${yr}`
}

/** Верх шкалы Y с «красивым» шагом. */
function chartMaxValue(maxCount) {
  const n = Number(maxCount) || 0
  if (n <= 0) return 5
  const exp = Math.pow(10, Math.floor(Math.log10(n)))
  const f = n / exp
  let nice = 10
  if (f <= 1) nice = 1
  else if (f <= 2) nice = 2
  else if (f <= 5) nice = 5
  return nice * exp
}

function yTicks(chartMax, steps = 5) {
  const out = []
  for (let i = steps; i >= 0; i--) {
    out.push(Math.round((chartMax * i) / steps))
  }
  return out
}

const BAR_PALETTE = [
  { face: 'var(--accent-bright)', shade: 'rgba(16, 120, 72, 0.95)' },
  { face: 'rgba(52, 211, 153, 0.92)', shade: 'rgba(14, 100, 62, 0.95)' },
  { face: 'rgba(74, 222, 128, 0.88)', shade: 'rgba(12, 88, 56, 0.95)' },
  { face: 'rgba(34, 197, 94, 0.9)', shade: 'rgba(10, 76, 48, 0.95)' },
  { face: 'rgba(22, 163, 74, 0.92)', shade: 'rgba(8, 64, 40, 0.95)' },
  { face: 'rgba(21, 128, 61, 0.9)', shade: 'rgba(6, 52, 34, 0.95)' },
]

/**
 * @param {{ rows: Array<{ month: string, count: number }>, year?: number }} props
 */
export function AdminClubMonthlyChart({ rows, year }) {
  const list = Array.isArray(rows) ? rows : []

  const { chartMax, ticks, total, hasAny } = useMemo(() => {
    let max = 0
    let sum = 0
    for (const r of list) {
      const n = Number(r?.count ?? 0) || 0
      sum += n
      if (n > max) max = n
    }
    const cm = chartMaxValue(max)
    return { chartMax: cm, ticks: yTicks(cm), total: sum, hasAny: sum > 0 }
  }, [list])

  if (!list.length) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Нет данных.
      </p>
    )
  }

  return (
    <div className="admin-monthly-chart">
      {!hasAny ? (
        <p className="muted admin-monthly-chart__empty-hint">
          За {year ? `${year} год` : '12 месяцев'} нет завершённых тренировок <strong>с типом карты</strong> (см. подпись ниже).
          Столбцы показаны для ориентира.
        </p>
      ) : null}

      <div className="admin-monthly-chart__plot" role="img" aria-label="График завершённых тренировок по месяцам">
        <div className="admin-monthly-chart__y-axis" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="admin-monthly-chart__y-label">
              {t}
            </span>
          ))}
        </div>

        <div className="admin-monthly-chart__scroll">
          <div
            className="admin-monthly-chart__cols"
            style={{ '--monthly-chart-max': String(chartMax), '--monthly-cols': String(list.length) }}
          >
            {ticks.map((t) => (
              <div
                key={`grid-${t}`}
                className="admin-monthly-chart__grid-line"
                style={{ bottom: `${chartMax ? (t / chartMax) * 100 : 0}%` }}
              />
            ))}

            {list.map((r, idx) => {
              const n = Number(r?.count ?? 0) || 0
              const hPct = chartMax ? Math.min(100, (n / chartMax) * 100) : 0
              const pal = BAR_PALETTE[idx % BAR_PALETTE.length]
              const title = `${monthLabelRu(r.month)}: ${n}`
              return (
                <div key={r.month} className="admin-monthly-chart__col-wrap" title={title}>
                  <div className="admin-monthly-chart__col-area">
                    {n > 0 ? (
                      <span className="admin-monthly-chart__col-value" aria-hidden>
                        {n}
                      </span>
                    ) : null}
                    <div
                      className={`admin-monthly-chart__col${n > 0 ? ' admin-monthly-chart__col--filled' : ''}`}
                      style={{
                        height: `${Math.max(hPct, n > 0 ? 4 : 0)}%`,
                        '--bar-face': pal.face,
                        '--bar-shade': pal.shade,
                      }}
                    >
                      <span className="admin-monthly-chart__col-face" />
                      <span className="admin-monthly-chart__col-shade" />
                    </div>
                  </div>
                  <span className="admin-monthly-chart__col-label" title={monthLabelRu(r.month)}>
                    {monthLabelShort(r.month)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {hasAny ? (
        <p className="muted admin-monthly-chart__sum">
          Всего за {year ? `${year} год` : 'период'} на графике: <strong>{total}</strong>
        </p>
      ) : null}

      <p className="muted admin-monthly-chart__foot">
        Завершённые тренировки со списанием по абонементу, у которого <strong>задан тип карты</strong>. «Без типа» в этот
        итог <strong>не входят</strong>.
      </p>
    </div>
  )
}
