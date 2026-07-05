import { useEffect, useMemo, useState } from 'react'
import { buildPlanMilestoneVisual } from '../lib/admin/salesPlanProgress.js'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { SalesPlanLevelsSummary } from './SalesPlanLevelsSummary.jsx'

function formatRubAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}

/**
 * @param {{
 *   fact: number,
 *   planLevels?: { level1?: number, level2?: number, level3?: number },
 *   pulseKey?: number,
 * }} props
 */
export function SalesPlanVessel({ fact, planLevels, pulseKey = 0 }) {
  const milestone = useMemo(() => buildPlanMilestoneVisual(fact, planLevels ?? {}), [fact, planLevels])
  const [mounted, setMounted] = useState(false)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    if (!pulseKey) return undefined
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 800)
    return () => clearTimeout(t)
  }, [pulseKey])

  const hasPlan = milestone.finalTarget > 0
  const achievedLabel =
    milestone.achievedLevel > 0 ? `Достигнут уровень ${milestone.achievedLevel}` : 'План не достигнут'

  const ariaLabel = hasPlan
    ? `Факт ${formatRub(fact)}, финал ${formatRub(milestone.finalTarget)}, ${achievedLabel}`
    : `Факт продаж за месяц: ${formatRub(fact)}`

  return (
    <div className="sales-report__plan-chart" aria-label={ariaLabel}>
      <div className="sales-report__plan-track-wrap">
        <div className="sales-report__plan-track sales-report__plan-track--milestones" aria-hidden>
          {milestone.milestones.map((m) => (
            <span
              key={m.key}
              className={`sales-report__plan-milestone${m.reached ? ' sales-report__plan-milestone--reached' : ''}${m.isFinal ? ' sales-report__plan-milestone--final' : ''}`}
              style={{ left: `${m.leftPercent}%` }}
              title={`План ${m.key}: ${formatRub(m.amount)}`}
            />
          ))}
          <div
            className={`sales-report__plan-fill${milestone.overflow ? ' sales-report__plan-fill--overflow' : ''}${pulse ? ' sales-report__plan-fill--pulse' : ''}${mounted ? ' sales-report__plan-fill--ready' : ''}${milestone.fillPercent > 0 ? ' sales-report__plan-fill--active' : ''}`}
            style={{ width: mounted ? `${milestone.fillPercent}%` : '0%' }}
          >
            <span className="sales-report__plan-shimmer" />
            <span className="sales-report__plan-edge" />
          </div>
        </div>

        {milestone.milestones.length ? (
          <div className="sales-report__plan-milestone-ruler" aria-hidden>
            {milestone.milestones.map((m) => (
              <span
                key={`tag-${m.key}`}
                className={`sales-report__plan-milestone-tag${m.reached ? ' is-reached' : ''}${m.isFinal ? ' is-final' : ''}`}
                style={{ left: `${m.leftPercent}%` }}
              >
                {m.key}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sales-report__plan-stats">
        <p className="sales-report__plan-stats-label muted">Факт / план</p>
        <p className="sales-report__plan-fraction">
          <span className="sales-report__plan-fact">{formatRubAmount(fact)}</span>
          <span className="sales-report__plan-sep">/</span>
          <span className="sales-report__plan-target">
            {hasPlan ? `${formatRubAmount(milestone.finalTarget)} ₽` : '—'}
          </span>
          {hasPlan && milestone.overflow ? (
            <span className="sales-report__plan-badge">+{milestone.overflowPercent}%</span>
          ) : null}
        </p>
      </div>

      {hasPlan ? (
        <SalesPlanLevelsSummary
          level1={planLevels?.level1}
          level2={planLevels?.level2}
          level3={planLevels?.level3}
          achievedLevel={milestone.achievedLevel}
        />
      ) : null}
    </div>
  )
}
