import { useMemo, useState } from 'react'
import { TicketMinus } from 'lucide-react'
import { todayLocalIso } from '../../lib/dateRu.js'
import {
  canDeductDeskAzSession,
  formatDeskAzSessionUsageRu,
  listAzMembershipsForDeductChoice,
  resolveDeskAzDeductDate,
} from '../../lib/admin/deskAzSessionDeductCore.js'
import { deskAzDirectionLabel } from '../../lib/admin/deskMembershipLedgerCore.js'
import { deductDeskAzSession } from '../../lib/admin/deskAzSessionDeductService.js'
import { AdminDeskMemDateField } from './AdminDeskMemDateField.jsx'
import { AdminDeskAzDeductPickBanners } from './AdminDeskAzDeductPickBanners.jsx'

/**
 * Подтверждение списания занятия АЗ (дата + OK).
 * Из списка при 2+ живых абонах — сначала выбор баннером.
 * Если списать нельзя — по тапу показывает причину (не «молчаливая» disabled-кнопка).
 *
 * @param {{
 *   membership: object,
 *   membershipOptions?: object[] | null,
 *   azTypes?: Array<{ id?: string, name?: string, code?: string }>,
 *   clientName?: string,
 *   onDone?: () => void,
 *   onToast?: (msg: string) => void,
 *   compact?: boolean,
 *   className?: string,
 * }} props
 */
export function AdminDeskAzDeductButton({
  membership,
  membershipOptions = null,
  azTypes = [],
  clientName = '',
  onDone,
  onToast,
  compact = false,
  className = '',
}) {
  const today = todayLocalIso()
  const choices = useMemo(
    () =>
      listAzMembershipsForDeductChoice(
        Array.isArray(membershipOptions) ? membershipOptions : membership ? [membership] : [],
        today,
      ),
    [membership, membershipOptions, today],
  )
  const needsPick = choices.length >= 2
  const triggerOk = choices.length > 0
  const blockedCheck = triggerOk ? { ok: true } : canDeductDeskAzSession(membership, today)
  const triggerUsage = formatDeskAzSessionUsageRu(choices[0] || membership)

  const [open, setOpen] = useState(false)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [step, setStep] = useState(/** @type {'pick'|'confirm'} */ ('confirm'))
  const [selected, setSelected] = useState(/** @type {object|null} */ (null))
  const [date, setDate] = useState(() => resolveDeskAzDeductDate(membership, today))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const target = selected || (!needsPick ? choices[0] || membership : null)
  const confirmCheck = target ? canDeductDeskAzSession(target, today) : { ok: false, error: 'Выберите абонемент' }
  const usageLabel = target ? formatDeskAzSessionUsageRu(target) : triggerUsage
  const directionLabel = target ? deskAzDirectionLabel(target.membership_type_id, azTypes) : ''

  const onTrigger = () => {
    if (!triggerOk) {
      setBlockedOpen(true)
      onToast?.(blockedCheck.error)
      return
    }
    setError('')
    if (needsPick) {
      setSelected(null)
      setStep('pick')
    } else {
      const one = choices[0] || membership
      setSelected(one)
      setStep('confirm')
      setDate(resolveDeskAzDeductDate(one, today))
    }
    setOpen(true)
  }

  const onPick = (m) => {
    setSelected(m)
    setDate(resolveDeskAzDeductDate(m, today))
    setError('')
    setStep('confirm')
  }

  const run = async () => {
    if (!target?.id || busy || !confirmCheck.ok) return
    setBusy(true)
    setError('')
    try {
      const res = await deductDeskAzSession({ membershipId: target.id, date })
      if (!res.ok) {
        setError(res.error || 'Не удалось списать')
        return
      }
      setOpen(false)
      const dir =
        directionLabel && directionLabel !== '—' ? ` (${directionLabel})` : ''
      if (res.warning) onToast?.(res.warning)
      else onToast?.(clientName ? `Списано занятие: ${clientName}${dir}` : `Занятие списано${dir}`)
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
            ? `btn btn-secondary btn-icon-square btn-touch${triggerOk ? '' : ' is-muted'}${
                className ? ` ${className}` : ''
              }`
            : `btn btn-secondary btn-sm${triggerOk ? '' : ' is-muted'}${className ? ` ${className}` : ''}`
        }
        aria-disabled={!triggerOk}
        title={
          triggerOk
            ? needsPick
              ? `Списать занятие · ${choices.length} абона`
              : `Списать занятие (${triggerUsage})`
            : blockedCheck.error
        }
        aria-label={triggerOk ? 'Списать занятие АЗ' : `Списать нельзя: ${blockedCheck.error}`}
        onClick={onTrigger}
      >
        <TicketMinus size={compact ? 20 : 16} aria-hidden />
        {compact ? null : ' Списать занятие'}
      </button>
      {!compact && !triggerOk ? (
        <p className="muted admin-desk-az-deduct-reason">{blockedCheck.error}</p>
      ) : null}

      {blockedOpen ? (
        <div className="admin-desk-az-modal" role="dialog" aria-modal="true" aria-label="Списать нельзя">
          <div className="admin-desk-az-modal__backdrop" onClick={() => setBlockedOpen(false)} />
          <div className="admin-desk-az-modal__card">
            <h3 className="admin-desk-az-modal__title">Списать нельзя</h3>
            <p className="admin-desk-az-modal__lead">{blockedCheck.error}</p>
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
            {step === 'pick' ? (
              <>
                <h3 className="admin-desk-az-modal__title">С какого абона?</h3>
                <p className="muted admin-desk-az-modal__lead">
                  {clientName ? <strong>{clientName}. </strong> : null}
                  Выберите направление — потом дату занятия.
                </p>
                <AdminDeskAzDeductPickBanners memberships={choices} azTypes={azTypes} onPick={onPick} />
                <div className="admin-desk-az-modal__actions">
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
                    Отмена
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="admin-desk-az-modal__title">Списать занятие?</h3>
                <p className="muted admin-desk-az-modal__lead">
                  {clientName ? <strong>{clientName}. </strong> : null}
                  {directionLabel && directionLabel !== '—' ? (
                    <>
                      Направление <strong>{directionLabel}</strong>.{' '}
                    </>
                  ) : null}
                  Счётчик абонемента увеличится ({usageLabel}
                  {confirmCheck.usage ? ` → ${(confirmCheck.usage.used || 0) + 1} из ${confirmCheck.usage.total}` : ''}
                  ). Дата и направление попадут в журнал и подсказку дневного отчёта АЗ.
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
                  {needsPick ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        setStep('pick')
                        setError('')
                      }}
                    >
                      Другой абон
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
                    Отмена
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
