import { MembershipTypeStatsTable } from './MembershipTypeStatsTable.jsx'
import { SALES_TRAINING_TYPE_NONE, salesTrainingCellKey } from '../lib/admin/salesTrainingsMatrix.js'

/**
 * @param {{
 *   trainers: Array<{ id: string, name?: string, email?: string }>,
 *   columns: Array<{ typeId: string, code: string }>,
 *   matrix: Record<string, string>,
 *   onMatrixChange: (next: Record<string, string>) => void,
 *   fitCityStats?: { byType?: object[], byTrainerByType?: object[] } | null,
 *   canEdit?: boolean,
 * }} props
 */
export function SalesTrainingsMatrix({
  trainers = [],
  columns = [],
  matrix = {},
  onMatrixChange,
  fitCityStats = null,
  canEdit = true,
}) {
  const trainerLabel = (id) => {
    const tr = trainers.find((t) => String(t.id) === String(id))
    if (!tr) return id || '—'
    return String(tr.name ?? tr.email ?? id).trim() || id
  }

  const setCell = (trainerId, typeId, value) => {
    const key = salesTrainingCellKey(trainerId, typeId === SALES_TRAINING_TYPE_NONE ? null : typeId)
    onMatrixChange({ ...matrix, [key]: value })
  }

  const cellValue = (trainerId, typeId) => {
    const key = salesTrainingCellKey(trainerId, typeId === SALES_TRAINING_TYPE_NONE ? null : typeId)
    return matrix[key] ?? ''
  }

  const countCell = (trainerId, colTypeId) => {
    const raw = cellValue(trainerId, colTypeId)
    if (raw === '') return 0
    const n = Math.floor(Number(String(raw).replace(/\s/g, '')))
    return Number.isFinite(n) ? n : 0
  }

  const typedTotalForTrainer = (trainerId) => {
    let sum = 0
    for (const col of columns) {
      if (col.typeId === SALES_TRAINING_TYPE_NONE) continue
      sum += countCell(trainerId, col.typeId)
    }
    return sum
  }

  const clubCountForType = (colTypeId) => {
    let sum = 0
    for (const tr of trainers) {
      sum += countCell(tr.id, colTypeId)
    }
    return sum
  }

  const clubTypedTotal = trainers.reduce((s, tr) => s + typedTotalForTrainer(tr.id), 0)
  const clubAllTotal = trainers.reduce(
    (s, tr) => s + columns.reduce((s2, col) => s2 + countCell(tr.id, col.typeId), 0),
    0,
  )

  if (!columns.length) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Нет типов абонементов — задайте их в Структура → Типы абон.
      </p>
    )
  }

  return (
    <div className="sales-trainings-matrix">
      <p className="muted sales-trainings-matrix__note">
        Распределение <strong>тренировок за день</strong> по типам карт клуба. Итого в отчёте:{' '}
        <strong>{clubAllTotal}</strong> (типизировано: {clubTypedTotal}).
      </p>

      <div className="table-wrap admin-mem-type-table-wrap">
        <table className="admin-mem-type-table sales-trainings-matrix__table">
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
            {trainers.length ? (
              trainers.map((tr) => (
                <tr key={tr.id}>
                  <td className="admin-mem-type-table__trainer-col">{trainerLabel(tr.id)}</td>
                  {columns.map((c) => (
                    <td key={c.typeId} className="admin-mem-type-table__num">
                      {canEdit ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          className="sales-trainings-matrix__input"
                          aria-label={`${trainerLabel(tr.id)} ${c.code}`}
                          value={cellValue(tr.id, c.typeId)}
                          onChange={(e) => setCell(tr.id, c.typeId, e.target.value)}
                        />
                      ) : (
                        countCell(tr.id, c.typeId) || '—'
                      )}
                    </td>
                  ))}
                  <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                    <strong>{typedTotalForTrainer(tr.id)}</strong>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + 2} className="muted" style={{ padding: '0.75rem' }}>
                  Нет тренеров в клубе.
                </td>
              </tr>
            )}
            <tr className="admin-mem-type-table__club-row">
              <td className="admin-mem-type-table__trainer-col">
                <strong>По клубу</strong>
              </td>
              {columns.map((c) => (
                <td key={c.typeId} className="admin-mem-type-table__num">
                  <strong>{clubCountForType(c.typeId)}</strong>
                </td>
              ))}
              <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                <strong>{clubTypedTotal}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {fitCityStats?.byTrainerByType?.length ? (
        <details className="sales-trainings-matrix__hint">
          <summary className="sales-trainings-matrix__hint-summary muted">
            Справка FIT-CITY за этот день (завершённые и списания)
          </summary>
          <div style={{ marginTop: '0.75rem' }}>
            <MembershipTypeStatsTable
              byType={fitCityStats.byType ?? []}
              byTrainerByType={fitCityStats.byTrainerByType ?? []}
              trainerLabel={trainerLabel}
            />
          </div>
        </details>
      ) : null}
    </div>
  )
}
