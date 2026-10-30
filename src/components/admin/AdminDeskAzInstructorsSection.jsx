import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatTrainerSelectLabel } from '../../lib/admin/clientTrainerReassignCore.js'
import { resolveAzClientDirectionTypeId } from '../../lib/admin/adminClientsAzDirectionFilterCore.js'
import { deskAzDirectionLabel } from '../../lib/admin/deskMembershipLedgerCore.js'
import {
  listAzDirectionTypesForClub,
  listAzInstructorCandidatesForClub,
  listClientAzInstructorsLocal,
  refreshClientAzInstructorsClubCache,
  setPrimaryClientAzInstructor,
} from '../../lib/admin/clientAzInstructorsService.js'
import { flushCriticalWritesToCloud, criticalWriteCloudWarning } from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'

/**
 * Поле «Инструктор АЗ» в стиле «Тренер ПЗ» (не отдельный блок внизу, не trainer_id).
 */
export function AdminDeskAzInstructorsSection({
  client,
  memberships = [],
  clubId = '',
  onChanged,
  disabled = false,
}) {
  const clientId = String(client?.id ?? '')
  const resolvedClub = String(clubId || client?.club_id || '')
  const [rows, setRows] = useState([])
  const [instructors, setInstructors] = useState([])
  const [directions, setDirections] = useState([])
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  const todayIso = useMemo(() => todayInTimeZoneIso(), [])
  const directionTypeId = useMemo(() => {
    const fromMem = resolveAzClientDirectionTypeId(memberships, todayIso, client)
    if (fromMem) return fromMem
    return String(rows[0]?.direction_type_id ?? '').trim()
  }, [memberships, todayIso, client, rows])

  const directionLabel = useMemo(() => {
    if (!directionTypeId) return ''
    const label = deskAzDirectionLabel(directionTypeId, directions)
    return label && label !== '—' ? label : ''
  }, [directions, directionTypeId])

  const primaryInstructorId = useMemo(() => {
    const want = directionTypeId
    const match = want
      ? rows.find((r) => String(r.direction_type_id) === want)
      : rows[0]
    return String(match?.instructor_id ?? '').trim()
  }, [rows, directionTypeId])

  const reload = useCallback(async () => {
    if (!clientId) {
      setRows([])
      return
    }
    if (resolvedClub) {
      await refreshClientAzInstructorsClubCache(resolvedClub).catch(() => 0)
    }
    setRows(await listClientAzInstructorsLocal(clientId))
  }, [clientId, resolvedClub])

  useEffect(() => {
    let alive = true
    setLoadError('')
    void (async () => {
      try {
        await reload()
        if (!alive || !resolvedClub) return
        const [cands, dirs] = await Promise.all([
          listAzInstructorCandidatesForClub(resolvedClub),
          listAzDirectionTypesForClub(resolvedClub),
        ])
        if (!alive) return
        setInstructors(Array.isArray(cands) ? cands : [])
        setDirections(Array.isArray(dirs) ? dirs : [])
      } catch (e) {
        if (!alive) return
        setInstructors([])
        setDirections([])
        setLoadError(e?.message || 'Не удалось загрузить инструкторов АЗ')
      }
    })()
    return () => {
      alive = false
    }
  }, [reload, resolvedClub])

  const known = instructors.some((t) => String(t.id) === primaryInstructorId)

  const onSelect = async (nextId) => {
    setBusy(true)
    setSaveError('')
    try {
      if (!directionTypeId) {
        setSaveError('Сначала укажите направление АЗ в абонементе (Бокс / Степ…)')
        return
      }
      const res = await setPrimaryClientAzInstructor({
        client,
        instructorId: nextId,
        directionTypeId,
      })
      if (!res.ok) {
        setSaveError(res.error)
        return
      }
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Инструктор АЗ')
      if (warn) setSaveError(warn)
      await reload()
      dispatchLocalDataChanged()
      onChanged?.()
    } catch (err) {
      setSaveError(err?.message || 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="admin-desk-client-card__field">
      <span>Инструктор АЗ</span>
      <select
        value={primaryInstructorId}
        disabled={disabled || busy}
        onChange={(e) => void onSelect(e.target.value)}
        aria-label="Инструктор аэробного зала"
      >
        <option value="">— не назначен —</option>
        {primaryInstructorId && !known ? (
          <option value={primaryInstructorId}>Текущий инструктор (не в списке)</option>
        ) : null}
        {instructors.map((t) => (
          <option key={t.id} value={t.id}>
            {formatTrainerSelectLabel(t)}
          </option>
        ))}
      </select>
      <span className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
        {directionLabel
          ? `Направление: ${directionLabel}. Для сообщений и групповых занятий.`
          : 'Направление берётся из абонемента АЗ. Для сообщений и групповых занятий.'}
      </span>
      {loadError ? (
        <span className="muted" style={{ fontSize: 12 }}>
          {loadError}
        </span>
      ) : null}
      {saveError ? <span className="sales-report__error">{saveError}</span> : null}
    </label>
  )
}
