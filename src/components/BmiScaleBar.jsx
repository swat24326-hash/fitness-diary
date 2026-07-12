import { BMI_SCALE_TICKS, bmiToBarPercent, getBmiMeta } from '../lib/bmiScaleCore.js'

/**
 * Шкала ИМТ: голубой дефицит, зелёная норма, оранжевый избыток, красное ожирение.
 * @param {{ bmi: number | null | undefined }} props
 */
export function BmiScaleBar({ bmi }) {
  const meta = getBmiMeta(bmi)
  const pct = bmi != null ? Math.round(bmiToBarPercent(bmi)) : 0

  return (
    <div className="health-bmi" aria-label="Шкала ИМТ">
      <div className="health-bmi__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span className="health-bmi__seg health-bmi__seg--under" />
        <span className="health-bmi__seg health-bmi__seg--normal" />
        <span className="health-bmi__seg health-bmi__seg--over" />
        <span className="health-bmi__seg health-bmi__seg--obese" />
        {bmi != null ? (
          <span
            className="health-bmi__marker"
            style={{ left: `${bmiToBarPercent(bmi)}%`, background: meta?.color ?? 'var(--accent-bright)' }}
          />
        ) : null}
      </div>
      <div className="health-bmi__ticks health-bmi__ticks--scale">
        {BMI_SCALE_TICKS.map((tick) => (
          <span key={tick} className="health-bmi__tick" style={{ left: `${bmiToBarPercent(tick)}%` }}>
            {tick}
          </span>
        ))}
      </div>
    </div>
  )
}
