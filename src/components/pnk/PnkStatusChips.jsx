import { Link } from 'react-router-dom'
import {
  PNK_DELIVERABLE_KEYS,
  PNK_DELIVERABLE_LABELS,
  PNK_STAGE_LABELS,
  parsePnkDeliverables,
} from '../../lib/pnk/pnkStagesCore'

const SHORT = {
  contact: 'Касание',
  trial: 'Пробная',
  nutrition: 'Питание',
  homework: 'ДЗ',
}

/**
 * Чипы чеклиста ПНК — статус + опционально тап «отметить».
 */
export function PnkDeliverableChips({ client, interactive = false, busy = false, onToggle, links }) {
  const d = parsePnkDeliverables(client?.pnk_deliverables)
  return (
    <div className="pnk-chip-group" role="list" aria-label="Чеклист ПНК">
      {PNK_DELIVERABLE_KEYS.map((key) => {
        const on = Boolean(d[key])
        const label = SHORT[key] || PNK_DELIVERABLE_LABELS[key]
        const to = links?.[key]
        const className = `pnk-chip${on ? ' pnk-chip--on' : ''}${interactive && !on ? ' pnk-chip--action' : ''}`

        if (to && !on) {
          return (
            <Link key={key} role="listitem" to={to} className={`${className} u-no-decoration`} title={`Открыть: ${label}`}>
              {label}
            </Link>
          )
        }

        if (interactive && !on) {
          return (
            <button
              key={key}
              type="button"
              role="listitem"
              className={className}
              disabled={busy}
              title={`Отметить: ${label}`}
              onClick={() => onToggle?.(key)}
            >
              {label}
            </button>
          )
        }

        return (
          <span key={key} role="listitem" className={className} title={on ? 'Готово' : 'Ещё нет'}>
            {on ? '✓ ' : ''}
            {label}
          </span>
        )
      })}
    </div>
  )
}

export function PnkStageChip({ stage, tone }) {
  const label = PNK_STAGE_LABELS[stage] || stage || '—'
  return (
    <span className={`pnk-chip pnk-chip--stage${tone ? ` pnk-chip--${tone}` : ''}`} title="Этап воронки">
      {label}
    </span>
  )
}

export function PnkAttentionChips({ flags }) {
  if (!flags?.length) return null
  return (
    <div className="pnk-chip-group pnk-chip-group--flags" role="list" aria-label="Внимание">
      {flags.map((f) => (
        <span key={f.code} role="listitem" className={`pnk-chip pnk-chip--flag pnk-chip--${f.tone}`}>
          {f.label}
        </span>
      ))}
    </div>
  )
}

export function PnkQualityChips({ nutritionPct, homeworkPct, periodLabel }) {
  return (
    <div className="pnk-funnel__quality" aria-label="Качество">
      <span className="pnk-chip pnk-chip--flag pnk-chip--ok" title="Доля ПНК с питанием">
        Питание {nutritionPct}%
      </span>
      <span className="pnk-chip pnk-chip--flag pnk-chip--ok" title="Доля ПНК с ДЗ">
        ДЗ {homeworkPct}%
      </span>
      {periodLabel ? <span className="muted" style={{ fontSize: '0.85rem' }}>{periodLabel}</span> : null}
    </div>
  )
}
