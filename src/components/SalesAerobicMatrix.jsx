import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  aerobicSalesCellKey,
  buildAerobicSalesMatrixColumns,
} from '../lib/admin/aerobicSalesMatrix.js'
import { buildAerobicPayRateMap, computeAerobicPayrollFromRows } from '../lib/admin/aerobicPayrollCore.js'
import { formatRub } from '../lib/admin/salesReportCore.js'

/**
 * @param {{
 *   columns: Array<{ typeId: string, code: string, inactive?: boolean }>,
 *   membershipTypes?: Array<{ id: string, aerobic_pay_amount?: number | string, is_active?: boolean }>,
 *   matrix: Record<string, string>,
 *   onMatrixChange: (next: Record<string, string>) => void,
 *   canEdit?: boolean,
 *   clubId?: string,
 *   showPayroll?: boolean,
 * }} props
 */
export function SalesAerobicMatrix({
  columns: _columns = [],
  membershipTypes = [],
  matrix = {},
  onMatrixChange,
  canEdit = true,
  clubId = '',
  showPayroll = true,
}) {
  const typedColumns = useMemo(() => buildAerobicSalesMatrixColumns(membershipTypes), [membershipTypes])

  const setCell = (typeId, value) => {
    const key = aerobicSalesCellKey(typeId)
    onMatrixChange({ ...matrix, [key]: value })
  }

  const cellValue = (typeId) => matrix[aerobicSalesCellKey(typeId)] ?? ''

  const countCell = (typeId) => {
    const raw = cellValue(typeId)
    if (raw === '') return 0
    const n = Math.floor(Number(String(raw).replace(/\s/g, '')))
    return Number.isFinite(n) ? n : 0
  }

  const dayPay = useMemo(() => {
    const rateMap = buildAerobicPayRateMap(membershipTypes)
    const rows = typedColumns
      .map((col) => ({ membership_type_id: col.typeId, count: countCell(col.typeId) }))
      .filter((r) => r.count > 0)
    return computeAerobicPayrollFromRows(rows, rateMap)
  }, [membershipTypes, typedColumns, matrix])

  const typesHref = clubId ? `/admin/membership-types?club=${encodeURIComponent(clubId)}` : '/admin/membership-types'

  if (!typedColumns.length) {
    return (
      <div className="sales-trainings-matrix sales-trainings-matrix--empty">
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
          Нет типов абонементов аэробного зала — задайте их в{' '}
          <Link to={typesHref}>Структура → Типы абон.</Link> (раздел «Аэробный зал»), затем нажмите «Обновить».
        </p>
      </div>
    )
  }

  return (
    <div className="sales-trainings-matrix">
      <div className="table-wrap">
        <table className="admin-mem-type-table sales-trainings-matrix__table">
          <thead>
            <tr>
              <th className="sales-trainings-matrix__row-label">АЗ</th>
              {typedColumns.map((col) => (
                <th
                  key={col.typeId}
                  className={`admin-mem-type-table__num${col.inactive ? ' sales-trainings-matrix__inactive-col' : ''}`}
                >
                  {col.code}
                </th>
              ))}
              {showPayroll ? (
                <th className="admin-mem-type-table__num sales-trainings-matrix__total-col">ЗП дня</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sales-trainings-matrix__row-label">Кол-во</td>
              {typedColumns.map((col) => (
                <td
                  key={col.typeId}
                  className={`admin-mem-type-table__num${col.inactive ? ' sales-trainings-matrix__inactive-col' : ''}`}
                >
                  {canEdit ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      className="sales-trainings-matrix__input"
                      aria-label={`АЗ ${col.code}`}
                      value={cellValue(col.typeId)}
                      onChange={(e) => setCell(col.typeId, e.target.value)}
                      placeholder="0"
                    />
                  ) : (
                    countCell(col.typeId) || '—'
                  )}
                </td>
              ))}
              {showPayroll ? (
                <td className="admin-mem-type-table__num sales-trainings-matrix__total-col">
                  <strong>{formatRub(dayPay.clubTotal)}</strong>
                </td>
              ) : null}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: 12 }}>
        Количество проданных абонементов АЗ × стоимость типа = зарплата аэробного зала за день. Тренер не оформляет
        эти типы клиентам.
      </p>
    </div>
  )
}
