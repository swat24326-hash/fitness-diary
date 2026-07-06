import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  SALES_TRAINING_CLUB_ID,
  SALES_TRAINING_TYPE_NONE,
  salesTrainingCellKey,
  typedTrainingsMatrixColumns,
  computeClubTrainingsPayrollFromInputMap,
} from '../lib/admin/salesTrainingsMatrix.js'
import { MembershipTypeStatsTable } from './MembershipTypeStatsTable.jsx'
import { formatRub } from '../lib/admin/salesReportCore.js'

/**
 * @param {{
 *   trainers: Array<{ id: string, name?: string, email?: string }>,
 *   columns: Array<{ typeId: string, code: string, inactive?: boolean }>,
 *   membershipTypes?: Array<{ id: string, trainer_pay_per_session?: number | string, is_active?: boolean }>,
 *   matrix: Record<string, string>,
 *   onMatrixChange: (next: Record<string, string>) => void,
 *   fitCityStats?: { byType?: object[], byTrainerByType?: object[] } | null,
 *   canEdit?: boolean,
 *   aggregateOnly?: boolean,
 *   clubId?: string,
 *   showPayroll?: boolean,
 * }} props
 */
export function SalesTrainingsMatrix({
  trainers = [],
  columns = [],
  membershipTypes: _membershipTypes = [],
  matrix = {},
  onMatrixChange,
  fitCityStats = null,
  canEdit = true,
  aggregateOnly = true,
  clubId = '',
  showPayroll = true,
}) {
  const typedColumns = useMemo(() => typedTrainingsMatrixColumns(columns), [columns])

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

  const typedTotal = (trainerId) => {
    let sum = 0
    for (const col of typedColumns) sum += countCell(trainerId, col.typeId)
    return sum
  }

  const clubAllTotal = aggregateOnly
    ? columns.reduce((s, col) => s + countCell(SALES_TRAINING_CLUB_ID, col.typeId), 0)
    : 0

  const dayPay = useMemo(
    () => computeClubTrainingsPayrollFromInputMap(matrix, _membershipTypes),
    [_membershipTypes, matrix],
  )

  const typesHref = clubId ? `/admin/membership-types?club=${encodeURIComponent(clubId)}` : '/admin/membership-types'

  if (!typedColumns.length) {
    return (
      <div className="sales-trainings-matrix sales-trainings-matrix--empty">
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
          Нет типов абонементов для этого клуба — таблица «по типам карт» не может построиться. Задайте типы в{' '}
          <Link to={typesHref}>Структура → Типы абон.</Link>, затем нажмите «Обновить».
        </p>
      </div>
    )
  }

  const noneColumn = columns.find((c) => c.typeId === SALES_TRAINING_TYPE_NONE)

  const renderCell = (trainerId, col, editable) => {
    const isNone = col.typeId === SALES_TRAINING_TYPE_NONE
    return (
      <td
        key={col.typeId}
        className={`admin-mem-type-table__num${isNone ? ' sales-trainings-matrix__none-col' : ''}${col.inactive ? ' sales-trainings-matrix__inactive-col' : ''}`}
      >
        {editable ? (
          <input
            type="text"
            inputMode="numeric"
            className="sales-trainings-matrix__input"
            aria-label={`${aggregateOnly ? 'По клубу' : trainerLabel(trainerId)} ${col.code}`}
            value={cellValue(trainerId, col.typeId)}
            onChange={(e) => setCell(trainerId, col.typeId, e.target.value)}
            placeholder="0"
          />
        ) : (
          countCell(trainerId, col.typeId) || '—'
        )}
      </td>
    )
  }

  return (
    <div className="sales-trainings-matrix">
      <p className="muted sales-trainings-matrix__note">
        Число <strong>тренировок за день</strong> по типу карты (Br, Vip, …). Одна строка «По клубу» — без
        разбивки по тренерам. Итого: <strong>{clubAllTotal}</strong> (типизировано:{' '}
        <strong>{typedTotal(SALES_TRAINING_CLUB_ID)}</strong>). «Без типа» — в ЗП персонального зала не входит.
        {showPayroll ? (
          <>
            {' '}
            ЗП дня = тренировки × ставка типа из{' '}
            <Link to={typesHref}>Структура → Типы абон.</Link> (ПЗ).
          </>
        ) : null}
      </p>

      <div className="table-wrap admin-mem-type-table-wrap sales-trainings-matrix__scroll">
        <table className="admin-mem-type-table sales-trainings-matrix__table">
          <thead>
            <tr>
              <th className="admin-mem-type-table__trainer-col">{aggregateOnly ? 'Клуб' : 'Тренер'}</th>
              {typedColumns.map((c) => (
                <th key={c.typeId} className="admin-mem-type-table__type-col" title={c.inactive ? 'Неактивный тип' : undefined}>
                  {c.code}
                  {c.inactive ? <span className="sales-trainings-matrix__inactive-tag"> off</span> : null}
                </th>
              ))}
              <th className="admin-mem-type-table__type-col sales-trainings-matrix__none-col">Без типа</th>
              <th className="admin-mem-type-table__sum-col">Итого</th>
              {showPayroll ? (
                <th className="admin-mem-type-table__num sales-trainings-matrix__total-col">ЗП дня</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="admin-mem-type-table__trainer-col">
                <strong>По клубу</strong>
              </td>
              {typedColumns.map((c) => renderCell(SALES_TRAINING_CLUB_ID, c, canEdit))}
              {noneColumn ? renderCell(SALES_TRAINING_CLUB_ID, noneColumn, canEdit) : null}
              <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                <strong>{typedTotal(SALES_TRAINING_CLUB_ID)}</strong>
              </td>
              {showPayroll ? (
                <td className="admin-mem-type-table__num sales-trainings-matrix__total-col">
                  <strong>{formatRub(dayPay)}</strong>
                </td>
              ) : null}
            </tr>
          </tbody>
        </table>
      </div>

      {fitCityStats?.byType?.length ? (
        <details className="sales-trainings-matrix__hint">
          <summary className="sales-trainings-matrix__hint-summary muted">
            Справка FIT-CITY за этот день (завершённые и списания)
          </summary>
          <div style={{ marginTop: '0.75rem' }}>
            <MembershipTypeStatsTable
              byType={fitCityStats.byType ?? []}
              byTrainerByType={[]}
              trainerLabel={trainerLabel}
            />
          </div>
        </details>
      ) : null}
    </div>
  )
}
