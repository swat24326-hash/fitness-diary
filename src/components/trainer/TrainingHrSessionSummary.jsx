/**
 * Сводка пульса сессии на шаге «Итог».
 * @param {{ summary: object | null | undefined }} props
 */
export function TrainingHrSessionSummary({ summary }) {
  if (!summary || summary.avg == null) return null

  const durationMin =
    summary.duration_sec != null ? Math.max(1, Math.round(summary.duration_sec / 60)) : null
  const zones = summary.zones

  return (
    <div className="training-hr-summary" role="region" aria-label="Пульс сессии">
      <h4 className="training-hr-summary__title">Пульс сессии</h4>
      <div className="training-hr-summary__stats">
        <div className="training-hr-summary__stat">
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
            <span className="training-hr-summary__zone-bar" style={{ width: `${zones.easy_pct}%` }} />
            <span className="training-hr-summary__zone-label">Лёгкая {zones.easy_pct}%</span>
          </div>
          <div className="training-hr-summary__zone training-hr-summary__zone--mid">
            <span className="training-hr-summary__zone-bar" style={{ width: `${zones.mid_pct}%` }} />
            <span className="training-hr-summary__zone-label">Средняя {zones.mid_pct}%</span>
          </div>
          <div className="training-hr-summary__zone training-hr-summary__zone--hard">
            <span className="training-hr-summary__zone-bar" style={{ width: `${zones.hard_pct}%` }} />
            <span className="training-hr-summary__zone-label">Высокая {zones.hard_pct}%</span>
          </div>
        </div>
      ) : (
        <p className="training-hr-summary__hint muted">Зоны недоступны — укажите дату рождения клиента</p>
      )}

      {summary.kcal_est != null ? (
        <p className="training-hr-summary__kcal">
          ~{summary.kcal_est} ккал <span className="training-hr-summary__kcal-note">(оценка)</span>
        </p>
      ) : (
        <p className="training-hr-summary__hint muted">
          Оценка ккал: нужны пол и вес в карте / поле «Вес»
        </p>
      )}
    </div>
  )
}
