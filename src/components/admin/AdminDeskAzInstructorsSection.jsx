import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { formatTrainerSelectLabel } from '../../lib/admin/clientTrainerReassignCore.js'
import { formatClientAzInstructorLabel } from '../../lib/admin/clientAzInstructorsCore.js'
import {
  assignClientAzInstructor,
  listAzDirectionTypesForClub,
  listAzInstructorCandidatesForClub,
  listClientAzInstructorsLocal,
  refreshClientAzInstructorsClubCache,
  removeClientAzInstructor,
} from '../../lib/admin/clientAzInstructorsService.js'
import { flushCriticalWritesToCloud, criticalWriteCloudWarning } from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'

/**
 * Назначение инструкторов АЗ на desk / multi-hall карточке (не trainer_id).
 */
export function AdminDeskAzInstructorsSection({ client, clubId = '', onChanged }) {
  const clientId = String(client?.id ?? '')
  const resolvedClub = String(clubId || client?.club_id || '')
  const [rows, setRows] = useState([])
  const [instructors, setInstructors] = useState([])
  const [directions, setDirections] = useState([])
  const [instructorId, setInstructorId] = useState('')
  const [directionTypeId, setDirectionTypeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!clientId) {
      setRows([])
      return
    }
    if (resolvedClub) {
      await refreshClientAzInstructorsClubCache(resolvedClub).catch(() => 0)
    }
    const list = await listClientAzInstructorsLocal(clientId)
    setRows(list)
  }, [clientId, resolvedClub])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        await reload()
        if (!alive) return
        if (resolvedClub) {
          const [cands, dirs] = await Promise.all([
            listAzInstructorCandidatesForClub(resolvedClub),
            listAzDirectionTypesForClub(resolvedClub),
          ])
          if (!alive) return
          setInstructors(cands)
          setDirections(dirs)
          if (!directionTypeId && dirs[0]?.id) setDirectionTypeId(String(dirs[0].id))
        }
      } catch (e) {
        if (!alive) return
        setError(e?.message || 'Не удалось загрузить инструкторов АЗ')
      }
    })()
    return () => {
      alive = false
    }
  }, [reload, resolvedClub])

  const nameByInstructor = Object.fromEntries(
    instructors.map((t) => [String(t.id), formatTrainerSelectLabel(t)]),
  )
  const nameByDirection = Object.fromEntries(
    directions.map((t) => [String(t.id), String(t.name || t.code || t.id)]),
  )

  const add = async (e) => {
    e?.preventDefault?.()
    setBusy(true)
    setError('')
    try {
      const res = await assignClientAzInstructor({
        client,
        instructorId,
        directionTypeId,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Инструктор АЗ')
      if (warn) setError(warn)
      setInstructorId('')
      await reload()
      dispatchLocalDataChanged()
      onChanged?.()
    } catch (err) {
      setError(err?.message || 'Не удалось назначить')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row) => {
    setBusy(true)
    setError('')
    try {
      await removeClientAzInstructor(row.id, row)
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Инструктор АЗ')
      if (warn) setError(warn)
      await reload()
      dispatchLocalDataChanged()
      onChanged?.()
    } catch (err) {
      setError(err?.message || 'Не удалось снять')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-desk-az-instructors" aria-label="Инструкторы АЗ">
      <h3 className="admin-desk-az-instructors__title">Инструкторы АЗ</h3>
      <p className="muted admin-desk-az-instructors__hint">
        Не поле «Тренер ПЗ». Несколько человек на одно направление — можно. Появятся в сообщениях клиента
        (этап 2).
      </p>

      {rows.length ? (
        <ul className="admin-desk-az-instructors__list">
          {rows.map((row) => (
            <li key={row.id} className="admin-desk-az-instructors__row">
              <span>
                {formatClientAzInstructorLabel({
                  instructorName:
                    nameByInstructor[String(row.instructor_id)] || String(row.instructor_id).slice(0, 8),
                  directionName:
                    nameByDirection[String(row.direction_type_id)] ||
                    String(row.direction_type_id).slice(0, 8),
                })}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                aria-label="Снять инструктора"
                onClick={() => void remove(row)}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Пока никого не назначили</p>
      )}

      <form className="admin-desk-az-instructors__form" onSubmit={(e) => void add(e)}>
        <label>
          Направление
          <select
            value={directionTypeId}
            onChange={(e) => setDirectionTypeId(e.target.value)}
            disabled={busy || !directions.length}
            required
          >
            {!directions.length ? <option value="">Нет типов АЗ</option> : null}
            {directions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || t.code || t.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Инструктор
          <select
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            disabled={busy || !instructors.length}
            required
          >
            <option value="">Выберите…</option>
            {instructors.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTrainerSelectLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || !instructorId || !directionTypeId}>
          <Plus size={16} aria-hidden /> Добавить
        </button>
      </form>
      {error ? <p className="sales-report__error">{error}</p> : null}
    </section>
  )
}
