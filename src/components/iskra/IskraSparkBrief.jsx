import { X } from 'lucide-react'
import { IskraPlanArc } from './IskraPlanArc.jsx'
import { IskraOrb } from './IskraOrb.jsx'

/**
 * @param {{
 *   brief: object | null,
 *   kpi?: object | null,
 *   onCta: () => void,
 *   onDismiss?: () => void,
 *   compact?: boolean,
 * }} props
 */
export function IskraSparkBrief({ brief, kpi, onCta, onDismiss, compact = false }) {
  if (!brief?.lines?.length) return null
  const tone = brief.tone || 'neutral'
  const planPct = Number(kpi?.planPct ?? brief.planPct) || 0

  return (
    <section
      className={`iskra-spark-brief iskra-spark-brief--${tone}${compact ? ' iskra-spark-brief--compact' : ''}`}
      aria-label="Бриф ИСКРЫ"
    >
      <div className="iskra-spark-brief__glow" aria-hidden />
      {!compact ? (
        <IskraPlanArc
          planPct={planPct}
          hasPlan={kpi?.hasPlan !== false}
          tone={kpi?.plan_tone ?? tone}
          size={72}
        />
      ) : (
        <IskraOrb state="idle" size={40} className="iskra-spark-brief__orb" />
      )}
      <div className="iskra-spark-brief__copy">
        <p className="iskra-spark-brief__line iskra-spark-brief__line--1">{brief.lines[0]}</p>
        <p className="iskra-spark-brief__line iskra-spark-brief__line--2">{brief.lines[1]}</p>
        {!compact ? <p className="iskra-spark-brief__line iskra-spark-brief__line--3 muted">{brief.lines[2]}</p> : null}
        {brief.forecastLine ? (
          <p
            className={`iskra-spark-brief__forecast muted iskra-forecast-glance--${brief.forecastConfidence ?? 'medium'}`}
          >
            {brief.forecastLine}
          </p>
        ) : null}
      </div>
      <div className="iskra-spark-brief__actions">
        <button type="button" className="btn btn-primary btn-sm iskra-spark-brief__cta" onClick={onCta}>
          {brief.cta?.label ?? 'Сделать'}
        </button>
        {onDismiss ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm iskra-spark-brief__dismiss"
            aria-label="Скрыть бриф"
            onClick={onDismiss}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </section>
  )
}
