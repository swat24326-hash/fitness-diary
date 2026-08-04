import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listClientsByClubId, listMembershipsByClubId } from '../lib/localDbClubQuery.js'
import {
  aggregateDeskAzSessionsForDay,
  countUnaccountedAzSessionSlots,
  fillEmptyAerobicMatrixFromAzSessions,
  mergeAerobicMatrixWithAzSessionCounts,
} from '../lib/admin/deskAzSessionDeductCore.js'
import { deskAzDirectionLabel } from '../lib/admin/deskMembershipLedgerCore.js'
import { LOCAL_DATA_CHANGED } from '../lib/localDataEvents.js'

/**
 * Подсказка дневного отчёта по списаниям АЗ.
 *
 * Автоподстановка: при открытии дня заполняет только пустые ячейки матрицы.
 * Уже введённые числа не меняет. Баннер — если списаний больше, чем в матрице.
 *
 * @param {{
 *   clubId: string,
 *   reportDate: string,
 *   matrix: Record<string, string>,
 *   onMatrixChange: (next: Record<string, string>) => void,
 *   azTypes?: object[],
 *   canEdit?: boolean,
 * }} props
 */
export function SalesAerobicAzSessionsHint({
  clubId = '',
  reportDate = '',
  matrix = {},
  onMatrixChange,
  azTypes = [],
  canEdit = true,
}) {
  const [rows, setRows] = useState([])
  const autoFilledDateRef = useRef('')
  const matrixRef = useRef(matrix)
  matrixRef.current = matrix

  const reload = useCallback(() => {
    if (!clubId || !reportDate) {
      setRows([])
      return
    }
    void (async () => {
      try {
        const [clients, memberships] = await Promise.all([
          listClientsByClubId(clubId),
          listMembershipsByClubId(clubId),
        ])
        const nextRows = aggregateDeskAzSessionsForDay(memberships ?? [], clients ?? [], reportDate)
        setRows(nextRows)

        // Один раз на дату отчёта: пустые ячейки ← списания (ручные цифры не трогаем).
        if (
          canEdit &&
          typeof onMatrixChange === 'function' &&
          autoFilledDateRef.current !== reportDate &&
          nextRows.length
        ) {
          autoFilledDateRef.current = reportDate
          const filled = fillEmptyAerobicMatrixFromAzSessions(matrixRef.current, nextRows)
          if (filled.filledCells > 0) onMatrixChange(filled.matrix)
        }
      } catch {
        setRows([])
      }
    })()
  }, [clubId, reportDate, canEdit, onMatrixChange])

  useEffect(() => {
    autoFilledDateRef.current = ''
  }, [reportDate])

  useEffect(() => {
    reload()
    const onLocal = (e) => {
      const reason = String(e?.detail?.reason ?? '')
      if (reason.startsWith('desk-az-session') || reason === 'desk-membership-ledger') reload()
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onLocal)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, onLocal)
  }, [reload])

  const summary = useMemo(() => {
    return rows
      .map((r) => {
        const label = deskAzDirectionLabel(r.membership_type_id, azTypes)
        return `${label}: ${r.count}`
      })
      .join(' · ')
  }, [rows, azTypes])

  const unaccounted = useMemo(
    () => countUnaccountedAzSessionSlots(matrix, rows),
    [rows, matrix],
  )

  const needsApply = unaccounted > 0

  if (!rows.length) return null

  return (
    <div className="sales-aerobic-az-hint" role="status">
      <p className="sales-aerobic-az-hint__text">
        Списания АЗ за этот день: <strong>{summary}</strong>.
        {needsApply ? (
          <>
            {' '}
            Ещё не в матрице: <strong>{unaccounted}</strong> занят.
            {canEdit
              ? ' Пустые ячейки подставляем сами; если вы уже ввели число — его не уменьшаем. Можно довести кнопкой.'
              : ''}
          </>
        ) : (
          <> Матрица уже покрывает списания (или больше).</>
        )}
      </p>
      {canEdit && needsApply ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onMatrixChange?.(mergeAerobicMatrixWithAzSessionCounts(matrix, rows))}
          title="Довести каждую ячейку минимум до числа списаний по направлению"
        >
          Довести матрицу до списаний
        </button>
      ) : null}
    </div>
  )
}
