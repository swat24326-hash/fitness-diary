/**
 * Сводка: тренировки (завершённые + списания) по типу абонемента.
 * @param {{ byType: Array<{ typeId: string|null, code: string, count: number }>, byTrainerByType?: Array<{ trainerId: string, total: number, byType: object[] }>, trainerLabel?: (id: string) => string, showTrainerBreakdown?: boolean }} props
 */
export function MembershipTypeStatsBlock({ byType = [], byTrainerByType = [], trainerLabel, showTrainerBreakdown = true }) {
  const label = trainerLabel ?? ((id) => id || '—')

  if (!byType.length && (!showTrainerBreakdown || !byTrainerByType.length)) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Нет завершённых тренировок и списаний за период.
      </p>
    )
  }

  return (
    <div className="mem-type-stats">
      <p className="muted mem-type-stats__note" style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.45 }}>
        Учитываются только <strong>завершённые</strong> тренировки и <strong>списания</strong>. Тип берётся с абонемента
        сейчас (если тип меняли — пересчёт по новому).
      </p>

      {byType.length > 0 ? (
        <>
          <h4 className="mem-type-stats__subtitle">По клубу (все тренеры)</h4>
          <ul className="mem-type-stats__chips" aria-label="Сводка по типам">
            {byType.map((row) => (
              <li key={row.typeId ?? 'none'}>
                <span className="mem-type-stats__chip">
                  <span className="mem-type-stats__chip-code">{row.code}</span>
                  <span className="mem-type-stats__chip-count">{row.count}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {showTrainerBreakdown && byTrainerByType.length > 0 ? (
        <>
          <h4 className="mem-type-stats__subtitle" style={{ marginTop: 16 }}>
            По тренерам
          </h4>
          <div className="mem-type-stats__trainers">
            {byTrainerByType.map((tr) => (
              <div key={tr.trainerId || 'unknown'} className="card mem-type-stats__trainer-card">
                <p className="mem-type-stats__trainer-name">{label(tr.trainerId)}</p>
                <p className="muted mem-type-stats__trainer-total" style={{ margin: '0 0 8px', fontSize: 13 }}>
                  Всего: <strong>{tr.total}</strong>
                </p>
                <ul className="mem-type-stats__chips mem-type-stats__chips--compact">
                  {tr.byType.map((row) => (
                    <li key={`${tr.trainerId}-${row.typeId ?? 'none'}`}>
                      <span className="mem-type-stats__chip mem-type-stats__chip--sm">
                        <span className="mem-type-stats__chip-code">{row.code}</span>
                        <span className="mem-type-stats__chip-count">{row.count}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
