import { useEffect, useMemo, useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import { deskAzSessionUsage } from '../../lib/admin/deskAzSessionDeductCore.js'
import {
  changeDeskAzSessionVisitDate,
  removeDeskAzSessionVisit,
} from '../../lib/admin/deskAzSessionDeductService.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { AdminDeskMemDateField } from './AdminDeskMemDateField.jsx'

/**
 * Журнал списанных занятий АЗ (даты можно менять / отменять).
 *
 * @param {{
 *   membership: object,
 *   onChanged?: () => void,
 *   onToast?: (msg: string) => void,
 * }} props
 */
export function AdminDeskAzSessionHistoryButton({ membership, onChanged, onToast }) {
  const [open, setOpen] = useState(false)
  const [localMem, setLocalMem] = useState(membership)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setLocalMem(membership)
  }, [membership])

  const usage = useMemo(() => deskAzSessionUsage(localMem), [localMem])
  const visits = usage.visits

  const changeDate = async (visitId, date) => {
    setBusyId(visitId)
    setError('')
    try {
      const res = await changeDeskAzSessionVisitDate({
        membershipId: localMem.id,
        visitId,
        date,
      })
      if (!res.ok) {
        setError(res.error || 'Не удалось изменить дату')
        return
      }
      if (res.membership) setLocalMem(res.membership)
      if (res.warning) onToast?.(res.warning)
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'Ошибка')
    } finally {
      setBusyId('')
    }
  }

  const remove = async (visitId) => {
    const ok = window.confirm('Отменить это списание? Занятие вернётся в остаток абонемента.')
    if (!ok) return
    setBusyId(visitId)
    setError('')
    try {
      const res = await removeDeskAzSessionVisit({ membershipId: localMem.id, visitId })
      if (!res.ok) {
        setError(res.error || 'Не удалось отменить')
        return
      }
      if (res.membership) setLocalMem(res.membership)
      if (res.warning) onToast?.(res.warning)
      else onToast?.('Списание отменено')
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'Ошибка')
    } finally {
      setBusyId('')
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setError('')
          setLocalMem(membership)
          setOpen(true)
        }}
        aria-label="Списанные занятия"
        title="Списанные занятия"
      >
        <History size={16} aria-hidden /> Журнал ({visits.length}
        {usage.undatedUsed > 0 ? `+${usage.undatedUsed}` : ''})
      </button>

      {open ? (
        <div className="admin-desk-az-modal" role="dialog" aria-modal="true" aria-label="Списанные занятия">
          <div className="admin-desk-az-modal__backdrop" onClick={() => setOpen(false)} />
          <div className="admin-desk-az-modal__card admin-desk-az-modal__card--wide">
            <h3 className="admin-desk-az-modal__title">Списанные занятия</h3>
            <p className="muted admin-desk-az-modal__lead">
              Использовано {usage.used}
              {usage.total > 0 ? ` из ${usage.total}` : ''}. Можно поправить дату или отменить списание.
              {usage.undatedUsed > 0
                ? ` Ещё ${usage.undatedUsed} без даты в журнале (старый счётчик) — новые списания будут с датами.`
                : ''}
            </p>
            {error ? <p className="sales-report__error">{error}</p> : null}
            {!visits.length ? (
              <p className="muted">Пока нет записей с датами.</p>
            ) : (
              <ul className="admin-desk-az-history">
                {visits.map((v) => (
                  <li key={v.id} className="admin-desk-az-history__row">
                    <AdminDeskMemDateField
                      value={v.date}
                      onChange={(d) => void changeDate(v.id, d)}
                      aria-label={`Дата занятия ${formatDateRu(v.date)}`}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon-square btn-sm"
                      disabled={busyId === v.id}
                      aria-label="Отменить списание"
                      title="Отменить списание"
                      onClick={() => void remove(v.id)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="admin-desk-az-modal__actions">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
