import { Heart } from 'lucide-react'
import {
  HR_ZONE_EASY_MAX_PCT,
  HR_ZONE_HARD_MIN_PCT,
  buildHrSessionGoalRings,
  hrSessionTargetVerdict,
  hrZoneMethodRows,
} from '../../lib/hr/hrSessionInsightCore.js'
import { TrainingHrGoalRings } from './TrainingHrGoalRings.jsx'
import { TrainingHrMinuteChart } from './TrainingHrMinuteChart.jsx'
import { TrainingHrZoneStack } from './TrainingHrZoneStack.jsx'

/**
 * Сводка пульса B*: кольца целей (полное = достигнуто) + чёрный график + зоны.
 * @param {{ summary: object | null | undefined, variant?: 'live' | 'readonly' }} props
 */
export function TrainingHrSessionSummary({ summary, variant = 'live' }) {
  if (!summary || summary.avg == null) return null

  const readonly = variant === 'readonly'
  const durationMin =
    summary.duration_sec != null ? Math.max(1, Math.round(summary.duration_sec / 60)) : null
  const zones = summary.zones
  const target = summary.target
  const methodRows = hrZoneMethodRows(summary.max_hr)
  const verdict = zones ? hrSessionTargetVerdict(zones) : null
  const beatSec =
    summary.avg > 0 ? Math.max(0.45, Math.min(1.2, 60 / Number(summary.avg))) : 0.9
  const series = Array.isArray(summary.series) ? summary.series : null
  const zonePct = {
    easy: Number(zones?.easy_pct) || 0,
    mid: Number(zones?.mid_pct) || 0,
    hard: Number(zones?.hard_pct) || 0,
  }
  const goalRings = buildHrSessionGoalRings({ zones, durationMin })

  return (
    <div
      className={`training-hr-summary training-hr-summary--b-min${
        readonly ? ' training-hr-summary--readonly' : ''
      }`}
      role="region"
      aria-label="Пульс сессии"
      style={{ ['--hr-summary-beat']: `${beatSec}s` }}
    >
      <div className="training-hr-summary__glow" aria-hidden />

      <div className="training-hr-summary__head">
        <span className="training-hr-summary__heart-wrap" aria-hidden>
          <Heart className="training-hr-summary__heart" size={16} strokeWidth={2.25} fill="currentColor" />
        </span>
        <h4 className="training-hr-summary__title">Пульс сессии</h4>
      </div>

      <div className="training-hr-summary__hero training-hr-summary__hero--rings">
        <div className="training-hr-summary__avg-col">
          <div className="training-hr-summary__avg-head">
            <div className="training-hr-summary__avg-block">
              <span className="training-hr-summary__avg-value">{summary.avg}</span>
            </div>
            <p className="training-hr-summary__avg-unit">уд/мин · средний</p>
          </div>
          <div
            className="training-hr-summary__meta training-hr-summary__meta--under"
            style={{ ['--hr-meta-cols']: String(durationMin != null ? 3 : 2) }}
          >
            <div>
              <span className="training-hr-summary__meta-k">мин</span>
              <b>{summary.min}</b>
            </div>
            <div>
              <span className="training-hr-summary__meta-k">макс</span>
              <b>{summary.max}</b>
            </div>
            {durationMin != null ? (
              <div>
                <span className="training-hr-summary__meta-k">время</span>
                <b>{durationMin}</b>
              </div>
            ) : null}
          </div>
        </div>

        {goalRings ? <TrainingHrGoalRings rings={goalRings} /> : null}
      </div>

      {target ? (
        <p className="training-hr-summary__goal-line">
          Цель ЧСС <strong>{target.lo}–{target.hi}</strong>
          <span className="training-hr-summary__goal-sep" aria-hidden>
            ·
          </span>
          <span className="training-hr-summary__goal-note">
            {HR_ZONE_EASY_MAX_PCT}–{HR_ZONE_HARD_MIN_PCT}% ЧССмакс
          </span>
          {verdict ? (
            <span className="training-hr-summary__verdict">{verdict}</span>
          ) : null}
        </p>
      ) : readonly ? null : (
        <p className="training-hr-summary__hint muted">Цель по методике — укажите дату рождения клиента</p>
      )}

      {series ? (
        <TrainingHrMinuteChart
          series={series}
          target={target}
          minBpm={summary.min}
          maxBpm={summary.max}
          maxHr={summary.max_hr}
          avgBpm={summary.avg}
        />
      ) : null}

      {zones && methodRows ? (
        <TrainingHrZoneStack rows={methodRows} zonePct={zonePct} />
      ) : zones ? null : readonly ? null : (
        <p className="training-hr-summary__hint muted">Зоны недоступны — укажите дату рождения клиента</p>
      )}

      <div className="training-hr-summary__foot">
        <span>
          {summary.max_hr != null
            ? `ЧССмакс ${summary.max_hr} · 220 − возраст`
            : 'ЧССмакс · 220 − возраст'}
        </span>
        {summary.kcal_est != null ? (
          <span className="training-hr-summary__foot-kcal">~{summary.kcal_est} ккал</span>
        ) : !readonly ? (
          <span className="training-hr-summary__foot-miss">ккал: нужны пол и вес</span>
        ) : null}
      </div>
    </div>
  )
}
