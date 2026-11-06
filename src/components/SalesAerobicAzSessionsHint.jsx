import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AzDayWriteoffRoll } from './admin/AzDayWriteoffRoll.jsx'
import {
  aggregateDeskAzSessionsForDay,
  countUnaccountedAzSessionSlots,
  fillEmptyAerobicMatrixFromAzSessions,
  listDeskAzDayWriteoffs,
  mergeAerobicMatrixWithAzSessionCounts,
} from '../lib/admin/deskAzSessionDeductCore.js'
import { buildAdminClientCardHref } from '../lib/admin/adminClientsListHrefCore.js'
import { listClientsByClubId, listMembershipsByClubId } from '../lib/localDbClubQuery.js'
import { removeDeskAzSessionVisit } from '../lib/admin/deskAzSessionDeductService.js'
import { LOCAL_DATA_CHANGED } from '../lib/localDataEvents.js'

/**
 * Перекличка списаний АЗ за день отчёта и доведение матрицы.
 * Пустые ячейки при открытии дня заполняются сами. Уже введённое число вниз не уменьшается.
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
  const { pathname } = useLocation()
  const [people, setPeople] = useState([])
  const [counts, setCounts] = useState([])
  const autoFilledDateRef = useRef('')
  const matrixRef = useRef(matrix)
  matrixRef.current = matrix

  const reload = useCallback(() => {
    if (!clubId || !reportDate) {
      setPeople([])
      setCounts([])
      return
    }
    void (async () => {
      try {
        const [clients, memberships] = await Promise.all([
          listClientsByClubId(clubId),
          listMembershipsByClubId(clubId),
        ])
        const nextPeople = listDeskAzDayWriteoffs(memberships ?? [], clients ?? [], reportDate)
        const nextCounts = aggregateDeskAzSessionsForDay(memberships ?? [], clients ?? [], reportDate)
        setPeople(nextPeople)
        setCounts(nextCounts)

        if (
          canEdit &&
          typeof onMatrixChange === 'function' &&
          autoFilledDateRef.current !== reportDate &&
          nextCounts.length
        ) {
          autoFilledDateRef.current = reportDate
          const filled = fillEmptyAerobicMatrixFromAzSessions(matrixRef.current, nextCounts)
          if (filled.filledCells > 0) onMatrixChange(filled.matrix)
        }
      } catch {
        setPeople([])
        setCounts([])
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

  const unaccounted = useMemo(
    () => countUnaccountedAzSessionSlots(matrix, counts),
    [counts, matrix],
  )

  const hrefForClient = useCallback(
    (clientId) => {
      const base = pathname.startsWith('/sales')
        ? '/sales/clients'
        : pathname.startsWith('/club')
          ? '/club/clients'
          : '/admin/clients'
      return buildAdminClientCardHref(base, clientId, {
        clubId: pathname.startsWith('/sales') ? '' : clubId,
        clientsTab: 'az',
        hall: 'az',
      })
    },
    [pathname, clubId],
  )

  const onCancel = useCallback(async (row) => {
    return removeDeskAzSessionVisit({
      membershipId: row.membershipId,
      visitId: row.visitId,
    })
  }, [])

  if (!people.length) return null

  return (
    <AzDayWriteoffRoll
      people={people}
      dayIso={reportDate}
      azTypes={azTypes}
      hrefForClient={hrefForClient}
      enableDirectionFilter
      canCancel={canEdit}
      onCancel={canEdit ? onCancel : null}
      matrixLag={canEdit ? unaccounted : 0}
      onFillMatrix={
        canEdit && unaccounted > 0
          ? () => onMatrixChange?.(mergeAerobicMatrixWithAzSessionCounts(matrix, counts))
          : null
      }
    />
  )
}
