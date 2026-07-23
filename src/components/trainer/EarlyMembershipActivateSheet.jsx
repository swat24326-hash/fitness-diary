import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import '../../styles/membership-early-activate.css'

/**
 * Подтверждение ранней активации абонемента (сдвиг дат).
 *
 * @param {{
 *   open: boolean,
 *   proposal: {
 *     from: { start: string, end: string },
 *     to: { start: string, end: string },
 *     daysShift: number,
 *     warnFar?: boolean,
 *   } | null,
 *   busy?: boolean,
 *   error?: string,
 *   onConfirm: () => void | Promise<void>,
 *   onCancel: () => void,
 * }} props
 */
export function EarlyMembershipActivateSheet({
  open,
  proposal,
  busy = false,
  error = '',
  onConfirm,
  onCancel,
}) {
  const titleId = useId()
  const [localBusy, setLocalBusy] = useState(false)
  if (!open || !proposal) return null

  const confirming = busy || localBusy

  const handleConfirm = async () => {
    if (confirming) return
    setLocalBusy(true)
    try {
      await onConfirm()
    } finally {
      setLocalBusy(false)
    }
  }

  return (
    <div
      className="membership-early-activate-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onCancel()
      }}
    >
      <div
        className="membership-early-activate-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="membership-early-activate-sheet__head">
          <h2 id={titleId} className="membership-early-activate-sheet__title">
            Активировать абонемент раньше?
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            aria-label="Закрыть"
            disabled={confirming}
            onClick={onCancel}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className="membership-early-activate-sheet__lead muted">
          Клиент пришёл раньше планового старта. Срок абонемента сдвинется на ту же длину — затем
          можно начать тренировку.
        </p>

        <div className="membership-early-activate-sheet__dates">
          <div>
            <span className="membership-early-activate-sheet__label muted">Было</span>
            <strong>
              {formatDateRu(proposal.from.start)} — {formatDateRu(proposal.from.end)}
            </strong>
          </div>
          <div>
            <span className="membership-early-activate-sheet__label muted">Станет</span>
            <strong>
              {formatDateRu(proposal.to.start)} — {formatDateRu(proposal.to.end)}
            </strong>
          </div>
        </div>

        {proposal.warnFar ? (
          <p className="membership-early-activate-sheet__warn" role="status">
            Плановый старт был больше чем через 14 дней — проверьте, что сдвиг нужен.
          </p>
        ) : null}

        {error ? (
          <p className="membership-early-activate-sheet__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="membership-early-activate-sheet__actions">
          <button type="button" className="btn btn-ghost btn-touch" disabled={confirming} onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={confirming}
            onClick={() => void handleConfirm()}
          >
            {confirming ? 'Сохраняем…' : 'Подтвердить и начать'}
          </button>
        </div>
      </div>
    </div>
  )
}
