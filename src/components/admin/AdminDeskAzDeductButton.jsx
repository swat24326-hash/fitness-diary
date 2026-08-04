import { useState } from 'react'
import { TicketMinus } from 'lucide-react'
import { todayLocalIso } from '../../lib/dateRu.js'
import {
  canDeductDeskAzSession,
  formatDeskAzSessionUsageRu,
  resolveDeskAzDeductDate,
} from '../../lib/admin/deskAzSessionDeductCore.js'
import { deductDeskAzSession } from '../../lib/admin/deskAzSessionDeductService.js'
import { AdminDeskMemDateField } from './AdminDeskMemDateField.jsx'

/**
 * Подтверждение списания занятия АЗ (дата + OK).
 * Если списать нельзя — по тапу показывает причину (не «молчаливая» disabled-кнопка).
 *
 * @param {{
 *   membership: object,
 *   clientName?: string,
 *   onDone?: () => void,
 *   onToast?: (msg: string) => void,
 *   compact?: boolean,
 *   className?: string,
 * }} props
 */
export function AdminDeskAzDeductButton({
  membership,
  clientName = '',
  onDone,
  onToast,
  compact = false,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [date, setDate] = useState(() => resolveDeskAzDeductDate(membership, todayLocalIso()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const check = canDeductDeskAzSession(membership, todayLocalIso())
  const usageLabel = formatDeskAzSessionUsageRu(membership)

  const onTrigger = () => {
    if (!check.ok) {
      setBlockedOpen(true)
      onToast?.(check.error)
      return
    }
    setError('')
    setDate(resolveDeskAzDeductDate(membership, todayLocalIso()))
    setOpen(true)
  }

  const run = async () => {
    if (!membership?.id || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await deductDeskAzSession({ membershipId: membership.id, date })
      if (!res.ok) {
        setError(res.error || 'Не удалось списать')
        return
      }
      setOpen(false)
      if (res.warning) onToast?.(res.warning)
      else onToast?.(clientName ? `Списано занятие: ${clientName}` : 'Занятие списано')
      onDone?.()
    } catch (e) {
      setError(e?.message || 'Ошибка списания')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={
          compact
            ? `btn btn-secondary btn-icon-square btn-touch${check.ok ? '' : ' is-muted'}${
                className ? ` ${className}` : ''
              }`
            : `btn btn-secondary btn-sm${check.ok ? '' : ' is-muted'}${className ? ` ${className}` : ''}`
        }
        aria-disabled={!check.ok}
        title={check.ok ? `Списать занятие (${usageLabel})` : check.error}
        aria-label={check.ok ? 'Списать занятие АЗ' : `Списать нельзя: ${check.error}`}
        onClick={onTrigger}
      >
        <TicketMinus size={compact ? 20 : 16} aria-hidden />
        {compact ? null : ' Списать занятие'}
      </button>
      {!compact && !check.ok ? (
        <p className="muted admin-desk-az-deduct-reason">{check.error}</p>
      ) : null}

      {blockedOpen ? (
        <div className="admin-desk-az-modal" role="dialog" aria-modal="true" aria-label="Списать нельзя">
          <div className="admin-desk-az-modal__backdrop" onClick={() => setBlockedOpen(false)} />
          <div className="admin-desk-az-modal__card">
            <h3 className="admin-desk-az-modal__title">Списать нельзя</h3>
            <p className="admin-desk-az-modal__lead">{check.error}</p>
            <div className="admin-desk-az-modal__actions">
              <button type="button" className="btn btn-secondary" onClick={() => setBlockedOpen(false)}>
                Понятно
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="admin-desk-az-modal" role="dialog" aria-modal="true" aria-label="Списание занятия АЗ">
          <div className="admin-desk-az-modal__backdrop" onClick={() => !busy && setOpen(false)} />
          <div className="admin-desk-az-modal__card">
            <h3 className="admin-desk-az-modal__title">Списать занятие?</h3>
            <p className="muted admin-desk-az-modal__lead">
              {clientName ? <strong>{clientName}. </strong> : null}
              Счётчик абонемента увеличится ({usageLabel}
              {check.usage ? ` → ${(check.usage.used || 0) + 1} из ${check.usage.total}` : ''}). Дата и направление
              попадут в журнал и подсказку дневного отчёта АЗ.
            </p>
            <label className="admin-desk-az-modal__field">
              Дата занятия
              <AdminDeskMemDateField value={date} onChange={setDate} aria-label="Дата списания" />
            </label>
            {error ? <p className="sales-report__error">{error}</p> : null}
            <div className="admin-desk-az-modal__actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>
                {busy ? 'Списываю…' : 'Подтвердить списание'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
