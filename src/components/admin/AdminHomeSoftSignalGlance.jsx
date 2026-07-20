import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Gauge, UserX } from 'lucide-react'
import { buildCoachQualityHomeGlanceVm } from '../../lib/admin/coachQualityHomeGlanceCore.js'

const ID_ICON = {
  'coach-quality': Gauge,
  inactive: UserX,
  expiring: Clock,
}

/**
 * Компактный сигнал в слоте ряда «внимание».
 * Для «Качество ведения» — шкала с отметками 70/85 и факты брифа.
 *
 * @param {{
 *   id?: string,
 *   title: string,
 *   subtitle?: string,
 *   href: string,
 *   tone?: 'warn' | 'hot' | 'neutral',
 *   compact?: boolean,
 *   scorePct?: number | null,
 *   chipLabel?: string | null,
 *   reviewCount?: number,
 *   attentionCount?: number,
 *   droppedCount?: number,
 * }} props
 */
export function AdminHomeSoftSignalGlance({
  id = '',
  title,
  subtitle = '',
  href,
  tone = 'neutral',
  compact = false,
  scorePct = null,
  chipLabel = null,
  reviewCount = 0,
  attentionCount = 0,
  droppedCount = 0,
}) {
  const Icon = ID_ICON[id] || (tone === 'warn' ? AlertTriangle : Gauge)
  const isCoachQuality = id === 'coach-quality'
  const vm = isCoachQuality
    ? buildCoachQualityHomeGlanceVm({
        scorePct,
        reviewCount,
        attentionCount,
        droppedCount,
        chipLabel,
      })
    : null
  const showScore = Boolean(vm && vm.scorePct != null)

  return (
    <Link
      to={href}
      className={`admin-home-soft-signal u-no-decoration${compact ? ' admin-home-soft-signal--compact' : ''}${tone === 'warn' ? ' admin-home-soft-signal--warn' : ''}${tone === 'hot' ? ' admin-home-soft-signal--hot' : ''}${showScore ? ' admin-home-soft-signal--score admin-home-soft-signal--cq' : ''}${vm ? ` admin-home-soft-signal--band-${vm.band}` : ''}`}
      title={
        showScore
          ? `${title}: ${vm.scorePct}/100 · ${vm.headline || vm.bandLabel}`
          : subtitle
            ? `${title}: ${subtitle}`
            : title
      }
    >
      <span className="admin-home-soft-signal__head">
        <span className="admin-home-soft-signal__title">{title}</span>
        <span className="admin-home-soft-signal__icon" aria-hidden>
          <Icon size={18} />
        </span>
      </span>

      {showScore && vm ? (
        <>
          <span className="admin-home-cq-glance__meta muted">
            {vm.scoreCaption} · {vm.periodLabel}
          </span>

          <span className="admin-home-cq-glance__score-row">
            <span className="admin-home-soft-signal__score">
              <span className="admin-home-soft-signal__score-value">{vm.scorePct}</span>
              <span className="admin-home-soft-signal__score-suffix muted">/100</span>
            </span>
            <span className={`admin-home-cq-glance__band admin-home-cq-glance__band--${vm.band}`}>
              {vm.bandLabel}
            </span>
          </span>

          <span className="admin-home-cq-glance__meter" aria-hidden>
            <span className="admin-home-cq-glance__track">
              <span className="admin-home-cq-glance__fill" style={{ width: `${vm.fillPct}%` }} />
              {vm.markers.map((m) => (
                <span
                  key={m.key}
                  className={`admin-home-cq-glance__mark admin-home-cq-glance__mark--${m.key}`}
                  style={{ left: `${m.at}%` }}
                  title={`${m.caption}: ${m.at}`}
                />
              ))}
            </span>
            <span className="admin-home-cq-glance__ruler">
              <span className="admin-home-cq-glance__ruler-end">0</span>
              {vm.markers.map((m) => (
                <span
                  key={m.key}
                  className="admin-home-cq-glance__ruler-tick"
                  style={{ left: `${m.at}%` }}
                >
                  <span className="admin-home-cq-glance__ruler-num">{m.label}</span>
                  <span className="admin-home-cq-glance__ruler-cap muted">{m.caption}</span>
                </span>
              ))}
              <span className="admin-home-cq-glance__ruler-end admin-home-cq-glance__ruler-end--max">
                100
              </span>
            </span>
          </span>

          {vm.facts.length > 0 ? (
            <span className="admin-home-cq-glance__facts" aria-label="Факты брифа">
              {vm.facts.map((f) => (
                <span
                  key={f.id}
                  className={`admin-home-cq-glance__fact admin-home-cq-glance__fact--${f.tone}`}
                >
                  <strong>{f.value}</strong>
                  <span>{f.label}</span>
                </span>
              ))}
            </span>
          ) : vm.headline ? (
            <span className="admin-home-cq-glance__headline muted">{vm.headline}</span>
          ) : null}
        </>
      ) : subtitle ? (
        <span className="admin-home-soft-signal__sub muted">{subtitle}</span>
      ) : null}

      <span className="admin-home-soft-signal__cta muted">Открыть</span>
    </Link>
  )
}
