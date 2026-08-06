import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SALES_TRAINING_CLUB_ID,
  SALES_TRAINING_TYPE_NONE,
  salesTrainingCellKey,
  typedTrainingsMatrixColumns,
  computeClubTrainingsPayrollFromInputMap,
  trainingsMatrixHasTrainerDetail,
  trainerIdsFromTrainingsMatrixInput,
  clubDisplayCountForType,
  isLikelyTrainerUuidLabel,
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
  aggregateOnly = false,
  clubId = '',
  showPayroll = true,
}) {
  const [showEmptyCols, setShowEmptyCols] = useState(false)
  const typedColumns = useMemo(() => typedTrainingsMatrixColumns(columns), [columns])
  const trainerIds = useMemo(
    () => trainers.map((t) => String(t.id ?? '').trim()).filter(Boolean),
    [trainers],
  )
  const detailMode = trainingsMatrixHasTrainerDetail(matrix)
  const clubEditable = canEdit && !detailMode

  const trainerLabel = (id) => {
    const sid = String(id ?? '').trim()
    const fromProp = trainers.find((t) => String(t.id) === sid)
    const name = String(fromProp?.name ?? fromProp?.email ?? '').trim()
    if (name && !isLikelyTrainerUuidLabel(name)) return name
    return name || 'Тренер'
  }

  const setCell = (trainerId, typeId, value) => {
    const key = salesTrainingCellKey(trainerId, typeId === SALES_TRAINING_TYPE_NONE ? null : typeId)
    onMatrixChange({ ...matrix, [key]: value })
  }

  const cellValue = (trainerId, typeId) => {
    if (trainerId === SALES_TRAINING_CLUB_ID && detailMode) {
      const n = clubDisplayCountForType(matrix, trainerIds, typeId)
      return n > 0 ? String(n) : ''
    }
    const key = salesTrainingCellKey(trainerId, typeId === SALES_TRAINING_TYPE_NONE ? null : typeId)
    return matrix[key] ?? ''
  }

  const countCell = (trainerId, colTypeId) => {
    if (trainerId === SALES_TRAINING_CLUB_ID) {
      return clubDisplayCountForType(matrix, trainerIds, colTypeId)
    }
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

  const dayPay = useMemo(
    () => computeClubTrainingsPayrollFromInputMap(matrix, _membershipTypes, trainerIds),
    [_membershipTypes, matrix, trainerIds],
  )

  const typesHref = clubId ? `/admin/membership-types?club=${encodeURIComponent(clubId)}` : '/admin/membership-types'

  const visibleTrainers = useMemo(() => {
    const base = aggregateOnly && !detailMode ? [] : [...(trainers ?? [])]
    const byId = new Map(base.map((t) => [String(t.id ?? '').trim(), t]))
    for (const id of trainerIdsFromTrainingsMatrixInput(matrix)) {
      if (!id || byId.has(id)) continue
      const known = trainers.find((t) => String(t.id) === id)
      const name = String(known?.name ?? '').trim()
      const row = {
        id,
        name: name && !isLikelyTrainerUuidLabel(name) ? name : 'Тренер',
      }
      byId.set(id, row)
      base.push(row)
    }
    return base
  }, [aggregateOnly, detailMode, trainers, matrix])

  /** В разбивке Excel — только типы с часами (ширина таблицы). */
  const displayTypedColumns = useMemo(() => {
    if (!detailMode || showEmptyCols) return typedColumns
    return typedColumns.filter((c) => countCell(SALES_TRAINING_CLUB_ID, c.typeId) > 0)
  }, [detailMode, showEmptyCols, typedColumns, matrix, trainerIds])

  const noneColumn = columns.find((c) => c.typeId === SALES_TRAINING_TYPE_NONE)
  const showNoneCol =
    Boolean(noneColumn) &&
    (!detailMode || showEmptyCols || countCell(SALES_TRAINING_CLUB_ID, SALES_TRAINING_TYPE_NONE) > 0)

  const displayTrainers = useMemo(() => {
    if (!detailMode) return visibleTrainers
    return visibleTrainers.filter((tr) => typedTotal(String(tr.id)) > 0)
  }, [detailMode, visibleTrainers, matrix, typedColumns, trainerIds])

  const emptyColCount = useMemo(() => {
    if (!detailMode) return 0
    return typedColumns.filter((c) => countCell(SALES_TRAINING_CLUB_ID, c.typeId) === 0).length
  }, [detailMode, typedColumns, matrix, trainerIds])

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

  const renderCell = (trainerId, col, editable) => {
    const isNone = col.typeId === SALES_TRAINING_TYPE_NONE
    const isClub = trainerId === SALES_TRAINING_CLUB_ID
    const edit = editable && !(isClub && detailMode)
    const raw = cellValue(trainerId, col.typeId)
    const n = countCell(trainerId, col.typeId)
    const filled = n > 0
    return (
      <td
        key={col.typeId}
        className={`admin-mem-type-table__num${isNone ? ' sales-trainings-matrix__none-col' : ''}${col.inactive ? ' sales-trainings-matrix__inactive-col' : ''}${filled ? ' sales-trainings-matrix__cell--filled' : ' sales-trainings-matrix__cell--empty'}`}
      >
        {edit ? (
          <input
            type="text"
            inputMode="numeric"
            className={`sales-trainings-matrix__input${filled ? ' is-filled' : ' is-empty'}`}
            aria-label={`${isClub ? 'По клубу' : trainerLabel(trainerId)} ${col.code}`}
            value={raw}
            onChange={(e) => setCell(trainerId, col.typeId, e.target.value)}
            placeholder="·"
          />
        ) : filled ? (
          n
        ) : (
          <span className="sales-trainings-matrix__dash" aria-hidden>
            ·
          </span>
        )}
      </td>
    )
  }

  return (
    <div className={`sales-trainings-matrix${detailMode ? ' sales-trainings-matrix--detail' : ''}`}>
      {detailMode ? (
        <div className="sales-trainings-matrix__toolbar">
          <p className="muted sales-trainings-matrix__note" style={{ margin: 0 }}>
            Разбивка по тренерам. «По клубу» — сумма. Пустые типы и нулевые строки скрыты.
          </p>
          {emptyColCount > 0 || showEmptyCols ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-touch"
              onClick={() => setShowEmptyCols((v) => !v)}
            >
              {showEmptyCols ? 'Скрыть пустые типы' : `Пустые типы (${emptyColCount})`}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="table-wrap admin-mem-type-table-wrap sales-trainings-matrix__scroll">
        <table className="admin-mem-type-table sales-trainings-matrix__table">
          <thead>
            <tr>
              <th className="admin-mem-type-table__trainer-col">
                {displayTrainers.length ? 'Тренер' : 'Клуб'}
              </th>
              {displayTypedColumns.map((c) => (
                <th
                  key={c.typeId}
                  className="admin-mem-type-table__type-col"
                  title={c.inactive ? 'Неактивный тип' : undefined}
                >
                  {c.code}
                  {c.inactive ? <span className="sales-trainings-matrix__inactive-tag"> off</span> : null}
                </th>
              ))}
              {showNoneCol ? (
                <th className="admin-mem-type-table__type-col sales-trainings-matrix__none-col">Без типа</th>
              ) : null}
              <th className="admin-mem-type-table__sum-col">Итого</th>
              {showPayroll ? (
                <th className="admin-mem-type-table__num sales-trainings-matrix__total-col">ЗП дня</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            <tr className="sales-trainings-matrix__club-row">
              <td className="admin-mem-type-table__trainer-col">
                <strong>По клубу</strong>
              </td>
              {displayTypedColumns.map((c) => renderCell(SALES_TRAINING_CLUB_ID, c, clubEditable))}
              {showNoneCol && noneColumn ? renderCell(SALES_TRAINING_CLUB_ID, noneColumn, clubEditable) : null}
              <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                <strong>{typedTotal(SALES_TRAINING_CLUB_ID)}</strong>
              </td>
              {showPayroll ? (
                <td className="admin-mem-type-table__num sales-trainings-matrix__total-col">
                  <strong>{formatRub(dayPay)}</strong>
                </td>
              ) : null}
            </tr>
            {displayTrainers.map((tr) => {
              const tid = String(tr.id)
              const rowTotal = typedTotal(tid)
              return (
                <tr key={tid}>
                  <td className="admin-mem-type-table__trainer-col">{trainerLabel(tid)}</td>
                  {displayTypedColumns.map((c) => renderCell(tid, c, canEdit))}
                  {showNoneCol && noneColumn ? renderCell(tid, noneColumn, canEdit) : null}
                  <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                    {rowTotal || '—'}
                  </td>
                  {showPayroll ? (
                    <td className="admin-mem-type-table__num sales-trainings-matrix__total-col sales-trainings-matrix__cell--empty">
                      ·
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {fitCityStats?.byType?.length ? (
        <details className="sales-trainings-matrix__hint">
          <summary className="sales-trainings-matrix__hint-summary muted">
            Справка FIT-CITY за этот день (завершённые и списания) — другой контур, не Excel отчёта
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
