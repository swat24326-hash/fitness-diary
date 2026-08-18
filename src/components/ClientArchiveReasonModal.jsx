import { useEffect, useId, useRef, useState } from 'react'
import {
  ARCHIVE_REASON_MAX_LEN,
  isArchiveReasonReady,
  normalizeArchiveReasonText,
} from '../lib/clientArchiveReasonCore.js'
import { useLoyaltyArchiveWarn } from '../hooks/useLoyaltyArchiveWarn.js'

/**
 * Модалка: причина при уходе в архив или дозаполнение у уже архивного.
 * @param {{
 *   open: boolean,
 *   mode?: 'enter' | 'edit',
 *   clientName?: string,
 *   initialReason?: string | null,
 *   client?: object | null,
 *   busy?: boolean,
 *   onCancel: () => void,
 *   onConfirm: (reason: string) => void,
 * }} props
 */
export function ClientArchiveReasonModal({
  open,
  mode = 'enter',
  clientName = '',
  client = null,
  initialReason = null,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const titleId = useId()
  const inputRef = useRef(null)
  const submitGuardRef = useRef(false)
  const [customText, setCustomText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setCustomText('')
      setSubmitting(false)
      submitGuardRef.current = false
      return
    }
    setCustomText(normalizeArchiveReasonText(initialReason) || '')
    setSubmitting(false)
    submitGuardRef.current = false
    const t = window.setTimeout(() => inputRef.current?.focus?.(), 50)
    return () => window.clearTimeout(t)
  }, [open, initialReason])

  useEffect(() => {
    if (!busy) {
      setSubmitting(false)
      submitGuardRef.current = false
    }
  }, [busy])

  const isEnter = mode === 'enter'
  const loyaltyWarn = useLoyaltyArchiveWarn(client, open && isEnter)

  if (!open) return null

  const reason = normalizeArchiveReasonText(customText)
  const ready = isArchiveReasonReady(reason)
  const title = isEnter ? 'В архив' : 'Причина архива'
  const confirmLabel = isEnter ? 'В архив' : 'Сохранить'
  const locked = busy || submitting

  const submit = () => {
    if (!ready || locked || submitGuardRef.current) return
    submitGuardRef.current = true
    setSubmitting(true)
    onConfirm?.(reason)
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => !locked && onCancel?.()}
    >
      <div
        className="modal-panel client-archive-reason-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="section-title" style={{ marginTop: 0 }}>
          {title}
        </h2>
        <p className="muted client-archive-reason-modal__lead">
          {isEnter ? (
            <>
              Убираем <strong style={{ color: 'var(--text)' }}>{clientName || 'клиента'}</strong> в
              архив. Укажите причину — так видно, почему человек не в работе.
            </>
          ) : (
            <>
              Причина для <strong style={{ color: 'var(--text)' }}>{clientName || 'клиента'}</strong>.
              Почему клиент в архиве?
            </>
          )}
        </p>
        {isEnter ? (
          <p className="muted client-archive-reason-modal__note">
            В архиве — просмотр карточки. Действия снова после «Вернуть из архива» (причина тогда
            сбросится).
          </p>
        ) : null}
        {isEnter && loyaltyWarn ? (
          <p className="loyalty-archive-warn" role="status">
            {loyaltyWarn}
          </p>
        ) : null}

        <label className="field client-archive-reason-modal__field">
          <span className="label">Причина *</span>
          <input
            ref={inputRef}
            className="input"
            value={customText}
            disabled={locked}
            maxLength={ARCHIVE_REASON_MAX_LEN}
            placeholder="Кратко: почему в архиве"
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && !locked) {
                e.preventDefault()
                submit()
              }
            }}
          />
        </label>

        <div className="row td-modal-actions client-archive-reason-modal__actions">
          <button type="button" className="btn btn-ghost btn-touch" disabled={locked} onClick={() => onCancel?.()}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={locked || !ready}
            onClick={() => submit()}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
