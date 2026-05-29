import { useMemo } from 'react'

function typeKey(row) {
  return row?.typeId ?? '__none__'
}

/**
 * Таблица: строки — тренеры, столбцы — типы карт, ячейки — количество.
 * @param {{ byType: object[], byTrainerByType: object[], trainerLabel: (id: string) => string }} props
 */
export function MembershipTypeStatsTable({ byType = [], byTrainerByType = [], trainerLabel }) {
  const label = trainerLabel ?? ((id) => id || '—')

  const columns = useMemo(() => {
    const cols = []
    const seen = new Set()
    for (const row of byType) {
      const key = typeKey(row)
      if (seen.has(key)) continue
      seen.add(key)
      cols.push({ typeId: key, code: row.code })
    }
    for (const tr of byTrainerByType) {
      for (const row of tr.byType ?? []) {
        const key = typeKey(row)
        if (seen.has(key)) continue
        seen.add(key)
        cols.push({ typeId: key, code: row.code })
      }
    }
    return cols
  }, [byType, byTrainerByType])

  const clubTotal = useMemo(() => byType.reduce((s, x) => s + (x.count ?? 0), 0), [byType])

  if (!columns.length && !byTrainerByType.length) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Нет завершённых тренировок и списаний за период.
      </p>
    )
  }

  const countForTrainer = (tr, colKey) => {
    const row = (tr.byType ?? []).find((x) => typeKey(x) === colKey)
    return row?.count ?? 0
  }

  const countForClub = (colKey) => {
    const row = byType.find((x) => typeKey(x) === colKey)
    return row?.count ?? 0
  }

  return (
    <div className="mem-type-stats">
      <p className="muted mem-type-stats__note" style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.45 }}>
        Учитываются только <strong>завершённые</strong> тренировки и <strong>списания</strong>. Тип берётся с абонемента
        сейчас (если тип меняли — пересчёт по новому).
      </p>
      <div className="table-wrap admin-mem-type-table-wrap">
        <table className="admin-mem-type-table">
          <thead>
            <tr>
              <th className="admin-mem-type-table__trainer-col">Тренер</th>
              {columns.map((c) => (
                <th key={c.typeId} className="admin-mem-type-table__type-col">
                  {c.code}
                </th>
              ))}
              <th className="admin-mem-type-table__sum-col">Итого</th>
            </tr>
          </thead>
          <tbody>
            {byTrainerByType.map((tr) => (
              <tr key={tr.trainerId || 'unknown'}>
                <td className="admin-mem-type-table__trainer-col">{label(tr.trainerId)}</td>
                {columns.map((c) => (
                  <td key={c.typeId} className="admin-mem-type-table__num">
                    {countForTrainer(tr, c.typeId)}
                  </td>
                ))}
                <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                  <strong>{tr.total ?? 0}</strong>
                </td>
              </tr>
            ))}
            <tr className="admin-mem-type-table__club-row">
              <td className="admin-mem-type-table__trainer-col">
                <strong>По клубу</strong>
              </td>
              {columns.map((c) => (
                <td key={c.typeId} className="admin-mem-type-table__num">
                  <strong>{countForClub(c.typeId)}</strong>
                </td>
              ))}
              <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                <strong>{clubTotal}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
