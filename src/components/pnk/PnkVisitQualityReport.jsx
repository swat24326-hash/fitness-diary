/**
 * Блок «Итог визита» — качество ведения ПНК (для админа / менеджера).
 */

const STATUS_MARK = {
  done: '✓',
  weak: '~',
  missing: '·',
}

function QualityItem({ item }) {
  return (
    <li className={`pnk-visit-quality__item pnk-visit-quality__item--${item.status}`}>
      <span className="pnk-visit-quality__mark" aria-hidden>
        {STATUS_MARK[item.status] || '·'}
      </span>
      <div className="pnk-visit-quality__body">
        <span className="pnk-visit-quality__label">{item.label}</span>
        <span className="pnk-visit-quality__note">{item.note}</span>
      </div>
    </li>
  )
}

export function PnkVisitQualityReport({ report, className = '' }) {
  if (!report?.items?.length) return null
  const phases = Array.isArray(report.phases) && report.phases.length > 0 ? report.phases : null
  const pct = report.pct != null ? Number(report.pct) : null

  return (
    <section
      className={`pnk-visit-quality${className ? ` ${className}` : ''}`}
      aria-label="Итог визита ПНК"
    >
      <div className="pnk-visit-quality__head">
        <h3 className="pnk-visit-quality__title">Итог визита</h3>
        <span className="pnk-visit-quality__badge" title="Сделано по делу / всего пунктов">
          {report.done}/{report.total}
        </span>
      </div>

      <ul className="pnk-visit-quality__chips" aria-label="Сводка по статусам">
        <li className="pnk-visit-quality__chip pnk-visit-quality__chip--done">
          <span className="pnk-visit-quality__chip-n">{report.done ?? 0}</span>
          <span className="pnk-visit-quality__chip-l">сделано</span>
        </li>
        <li className="pnk-visit-quality__chip pnk-visit-quality__chip--weak">
          <span className="pnk-visit-quality__chip-n">{report.weak ?? 0}</span>
          <span className="pnk-visit-quality__chip-l">слабо</span>
        </li>
        <li className="pnk-visit-quality__chip pnk-visit-quality__chip--missing">
          <span className="pnk-visit-quality__chip-n">{report.missing ?? 0}</span>
          <span className="pnk-visit-quality__chip-l">нет</span>
        </li>
      </ul>

      {phases ? (
        <div className="pnk-visit-quality__phases">
          {phases.map((phase) => (
            <div key={phase.id} className="pnk-visit-quality__phase">
              <p className="pnk-visit-quality__phase-title">{phase.label}</p>
              <ul className="pnk-visit-quality__list">
                {phase.items.map((item) => (
                  <QualityItem key={item.key} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="pnk-visit-quality__list">
          {report.items.map((item) => (
            <QualityItem key={item.key} item={item} />
          ))}
        </ul>
      )}

      {pct != null ? (
        <div className="pnk-visit-quality__pct-block" aria-label={`Полнота по делу ${pct}%`}>
          <div className="pnk-visit-quality__pct-row">
            <span className="pnk-visit-quality__pct-label">Полнота по делу</span>
            <span className="pnk-visit-quality__pct-value">{pct}%</span>
          </div>
          <div className="pnk-visit-quality__pct-track" aria-hidden>
            <div
              className="pnk-visit-quality__pct-fill"
              style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}
