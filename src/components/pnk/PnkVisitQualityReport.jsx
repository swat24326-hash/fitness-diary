/**
 * Блок «Итог визита» — качество ведения ПНК (для админа).
 */
export function PnkVisitQualityReport({ report, className = '' }) {
  if (!report?.items?.length) return null
  return (
    <section
      className={`pnk-visit-quality${className ? ` ${className}` : ''}`}
      aria-label="Итог визита ПНК"
    >
      <div className="pnk-visit-quality__head">
        <h3 className="pnk-visit-quality__title">Итог визита</h3>
        <span className="pnk-control-tile__step-badge" title="Сделано по делу / всего пунктов">
          {report.done}/{report.total}
        </span>
      </div>
      <p className="pnk-visit-quality__summary">{report.summaryLine}</p>
      <ul className="pnk-visit-quality__list">
        {report.items.map((item) => (
          <li key={item.key} className={`pnk-visit-quality__item pnk-visit-quality__item--${item.status}`}>
            <span className="pnk-visit-quality__label">{item.label}</span>
            <span className="pnk-visit-quality__note muted">{item.note}</span>
          </li>
        ))}
      </ul>
      {report.pct != null ? (
        <p className="pnk-visit-quality__pct muted">Полнота по делу: {report.pct}%</p>
      ) : null}
    </section>
  )
}
