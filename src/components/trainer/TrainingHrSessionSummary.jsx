import { Flame, Heart } from 'lucide-react'

/**
 * Сводка пульса сессии на шаге «Итог».
 * @param {{ summary: object | null | undefined }} props
 */
export function TrainingHrSessionSummary({ summary }) {
  if (!summary || summary.avg == null) return null

  const durationMin =
    summary.duration_sec != null ? Math.max(1, Math.round(summary.duration_sec / 60)) : null
  const zones = summary.zones
  const beatSec =
    summary.avg > 0 ? Math.max(0.45, Math.min(1.2, 60 / Number(summary.avg))) : 0.9

  return (
    <div
      className="training-hr-summary"
      role="region"
      aria-label="Пульс сессии"
      style={{ ['--hr-summary-beat']: `${beatSec}s` }}
    >
      <div className="training-hr-summary__glow" aria-hidden />
      <div className="training-hr-summary__head">
        <span className="training-hr-summary__heart-wrap" aria-hidden>
          <Heart className="training-hr-summary__heart" size={18} strokeWidth={2.25} fill="currentColor" />
        </span>
        <h4 className="training-hr-summary__title">Пульс сессии</h4>
      </div>

      <div className="training-hr-summary__stats">
        <div className="training-hr-summary__stat training-hr-summary__stat--avg">
          <span className="training-hr-summary__k">Ср.</span>
          <span className="training-hr-summary__v">{summary.avg}</span>
        </div>
        <div className="training-hr-summary__stat">
          <span className="training-hr-summary__k">Мин</span>
          <span className="training-hr-summary__v">{summary.min}</span>
        </div>
        <div className="training-hr-summary__stat">
          <span className="training-hr-summary__k">Макс</span>
          <span className="training-hr-summary__v">{summary.max}</span>
        </div>
        {durationMin != null ? (
          <div className="training-hr-summary__stat">
            <span className="training-hr-summary__k">Мин.</span>
            <span className="training-hr-summary__v">{durationMin}</span>
          </div>
        ) : null}
      </div>

      {zones ? (
        <div className="training-hr-summary__zones" aria-label="Зоны ЧСС">
          <div className="training-hr-summary__zone training-hr-summary__zone--easy">
            <span
              className="training-hr-summary__zone-bar"
              style={{ ['--zone-pct']: `${Number(zones.easy_pct) || 0}%` }}
            />
            <span className="training-hr-summary__zone-label">Лёгкая {zones.easy_pct}%</span>
          </div>
          <div className="training-hr-summary__zone training-hr-summary__zone--mid">
            <span
              className="training-hr-summary__zone-bar"
              style={{ ['--zone-pct']: `${Number(zones.mid_pct) || 0}%` }}
            />
            <span className="training-hr-summary__zone-label">Средняя {zones.mid_pct}%</span>
          </div>
          <div className="training-hr-summary__zone training-hr-summary__zone--hard">
            <span
              className="training-hr-summary__zone-bar"
              style={{ ['--zone-pct']: `${Number(zones.hard_pct) || 0}%` }}
            />
            <span className="training-hr-summary__zone-label">Высокая {zones.hard_pct}%</span>
          </div>
        </div>
      ) : (
        <p className="training-hr-summary__hint muted">Зоны недоступны — укажите дату рождения клиента</p>
      )}

      {summary.kcal_est != null ? (
        <p className="training-hr-summary__kcal">
          <Flame className="training-hr-summary__kcal-icon" size={16} strokeWidth={2.25} aria-hidden />
          <span>
            ~{summary.kcal_est} ккал <span className="training-hr-summary__kcal-note">(оценка)</span>
          </span>
        </p>
      ) : (
        <p className="training-hr-summary__hint muted">
          Оценка ккал: нужны пол и вес в карте / поле «Вес»
        </p>
      )}
    </div>
  )
}
