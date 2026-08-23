import { useId, useState } from 'react'

/**
 * Блок «Оценка регулярности» — вкладка Статистика → Посещаемость.
 * Подробности под кнопкой с меткой (Норма / Регулярно / …).
 *
 * @param {{
 *   assessment: import('../lib/clientAttendanceAssessmentCore.js').AttendanceAssessment,
 * }} props
 */
export function ClientAttendanceAssessmentPanel({ assessment }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  if (!assessment) return null

  const toneIcon = (tone) => {
    if (tone === 'good') return '✓'
    if (tone === 'warn') return '⚠'
    return '✗'
  }

  return (
    <section
      className={`stats-attendance-assessment${assessment.dataReliable ? '' : ' stats-attendance-assessment--tentative'}`}
      aria-label="Оценка регулярности"
    >
      <div className="stats-attendance-assessment__head">
        <div className="stats-attendance-assessment__titles">
          <h3 className="stats-attendance-assessment__title">Оценка регулярности</h3>
          {!open ? (
            <p className="muted stats-attendance-assessment__period">{assessment.periodLabelRu}</p>
          ) : null}
        </div>
        <button
          type="button"
          className={`stats-attendance-reg stats-attendance-reg--${assessment.regularity} stats-attendance-reg--toggle`}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Скрыть подробности' : 'Показать подробности'}
        >
          {assessment.regularityLabelRu}
          <span className="stats-attendance-reg__chevron" aria-hidden>
            {open ? '▴' : '▾'}
          </span>
        </button>
      </div>

      {open ? (
        <div id={bodyId} className="stats-attendance-assessment__body">
          <p className="muted stats-attendance-assessment__period">{assessment.periodLabelRu}</p>

          {assessment.disclaimerRu ? (
            <p className="stats-attendance-assessment__disclaimer" role="status">
              {assessment.disclaimerRu}
            </p>
          ) : null}

          <p className="stats-attendance-assessment__headline">{assessment.headlineRu}</p>

          {assessment.todayLineRu ? (
            <p className="stats-attendance-assessment__today muted">{assessment.todayLineRu}</p>
          ) : null}

          {assessment.membershipLineRu || assessment.trendLabelRu ? (
            <div className="stats-attendance-assessment__meta">
              {assessment.membershipLineRu ? (
                <span className="stats-attendance-assessment__meta-item">{assessment.membershipLineRu}</span>
              ) : null}
              {assessment.trendLabelRu ? (
                <span className="stats-attendance-assessment__meta-item stats-attendance-assessment__meta-item--trend">
                  Тренд: {assessment.trendLabelRu}
                </span>
              ) : null}
            </div>
          ) : null}

          {assessment.factors.length > 0 ? (
            <ul className="stats-attendance-assessment__factors">
              {assessment.factors.map((f) => (
                <li
                  key={f.key}
                  className={`stats-attendance-assessment__factor stats-attendance-assessment__factor--${f.tone}`}
                >
                  <span className="stats-attendance-assessment__factor-icon" aria-hidden="true">
                    {toneIcon(f.tone)}
                  </span>
                  <span aria-label={f.ariaLabelRu ?? f.labelRu}>{f.labelRu}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="stats-attendance-assessment__rec">
            <strong>Рекомендация:</strong> {assessment.recommendationRu}
          </p>
        </div>
      ) : null}
    </section>
  )
}
