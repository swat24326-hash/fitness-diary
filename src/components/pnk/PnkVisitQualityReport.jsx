/**
 * Блок «Итог визита» — качество ведения ПНК (для админа / менеджера).
 */

const STATUS_MARK = {
  done: '✓',
  weak: '~',
  missing: '·',
  pending: '…',
}

/** Сводка: только статусы с числом > 0; подпись сразу понятна. */
const SUMMARY_CHIPS = [
  {
    key: 'done',
    tone: 'done',
    label: 'сделано',
    title: 'Пункт сделан по делу',
    countOf: (r) => r.done ?? 0,
  },
  {
    key: 'weak',
    tone: 'weak',
    label: 'частично',
    title: 'Есть отметка, но неполно (например карта без обмеров)',
    countOf: (r) => r.weak ?? 0,
  },
  {
    key: 'missing',
    tone: 'missing',
    label: 'нет',
    title: 'Пункта нет — уже можно было сделать',
    countOf: (r) => r.missing ?? 0,
  },
  {
    key: 'pending',
    tone: 'pending',
    label: 'ждём',
    title: 'Ещё рано — клиент не в зале, пункт не штрафует',
    countOf: (r) => r.pending ?? 0,
  },
]

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

function buildVisibleChips(report) {
  return SUMMARY_CHIPS.map((chip) => ({
    ...chip,
    n: chip.countOf(report),
  })).filter((chip) => chip.n > 0)
}

export function PnkVisitQualityReport({ report, className = '' }) {
  if (!report?.items?.length) return null
  const phases = Array.isArray(report.phases) && report.phases.length > 0 ? report.phases : null
  const pct = report.pct != null ? Number(report.pct) : null
  const chips = buildVisibleChips(report)

  return (
    <section
      className={`pnk-visit-quality${className ? ` ${className}` : ''}`}
      aria-label="Итог визита ПНК"
    >
      <div className="pnk-visit-quality__head">
        <h3 className="pnk-visit-quality__title">Итог визита</h3>
        <span className="pnk-visit-quality__badge" title="Сделано по делу / пунктов, которые уже можно требовать">
          {report.done}/{report.total}
        </span>
      </div>

      {chips.length > 0 ? (
        <ul className="pnk-visit-quality__chips" aria-label="Сводка по статусам">
          {chips.map((chip) => (
            <li
              key={chip.key}
              className={`pnk-visit-quality__chip pnk-visit-quality__chip--${chip.tone}`}
              title={chip.title}
            >
              <span className="pnk-visit-quality__chip-n">{chip.n}</span>
              <span className="pnk-visit-quality__chip-l">{chip.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

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
            <span className="pnk-visit-quality__pct-label">Полнота по текущему этапу</span>
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
