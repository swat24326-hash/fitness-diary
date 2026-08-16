import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ARCHIVE_REASON_CHIPS,
  ARCHIVE_REASON_MAX_LEN,
  ARCHIVE_REASON_OTHER_ID,
  composeArchiveReason,
  isArchiveReasonReady,
  matchArchiveReasonChip,
} from '../lib/clientArchiveReasonCore.js'

/**
 * Модалка: причина при уходе в архив или дозаполнение у уже архивного.
 * @param {{
 *   open: boolean,
 *   mode?: 'enter' | 'edit',
 *   clientName?: string,
 *   initialReason?: string | null,
 *   busy?: boolean,
 *   onCancel: () => void,
 *   onConfirm: (reason: string) => void,
 * }} props
 */
export function ClientArchiveReasonModal({
  open,
  mode = 'enter',
  clientName = '',
  initialReason = null,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const titleId = useId()
  const inputRef = useRef(null)
  const submitGuardRef = useRef(false)
  const seed = useMemo(() => matchArchiveReasonChip(initialReason), [initialReason])
  const [chipId, setChipId] = useState(/** @type {string | null} */ (null))
  const [customText, setCustomText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setChipId(null)
      setCustomText('')
      setSubmitting(false)
      submitGuardRef.current = false
      return
    }
    setChipId(seed.chipId)
    setCustomText(seed.customText)
    setSubmitting(false)
    submitGuardRef.current = false
    const t = window.setTimeout(() => {
      if (seed.chipId === ARCHIVE_REASON_OTHER_ID || !seed.chipId) inputRef.current?.focus?.()
    }, 50)
    return () => window.clearTimeout(t)
  }, [open, seed.chipId, seed.customText])

  useEffect(() => {
    if (!busy) {
      setSubmitting(false)
      submitGuardRef.current = false
    }
  }, [busy])

  if (!open) return null

  const reason = composeArchiveReason({ chipId, customText })
  const ready = isArchiveReasonReady(reason)
  const isEnter = mode === 'enter'
  const title = isEnter ? 'В архив' : 'Причина архива'
  const confirmLabel = isEnter ? 'В архив' : 'Сохранить'
  const needCustom = !chipId || chipId === ARCHIVE_REASON_OTHER_ID
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

        <div className="client-archive-reason-modal__chips" role="group" aria-label="Быстрые причины">
          {ARCHIVE_REASON_CHIPS.map((chip) => {
            const pressed = chipId === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                className={`btn btn-touch client-archive-reason-chip${pressed ? ' client-archive-reason-chip--on' : ''}`}
                aria-pressed={pressed}
                disabled={locked}
                onClick={() => {
                  setChipId(chip.id)
                  if (chip.id !== ARCHIVE_REASON_OTHER_ID) setCustomText('')
                }}
              >
                {chip.label}
              </button>
            )
          })}
        </div>

        {needCustom ? (
          <label className="field client-archive-reason-modal__field">
            <span className="label">{chipId === ARCHIVE_REASON_OTHER_ID ? 'Своя причина *' : 'Или своими словами *'}</span>
            <input
              ref={inputRef}
              className="input"
              value={customText}
              disabled={locked}
              maxLength={ARCHIVE_REASON_MAX_LEN}
              placeholder="Кратко: почему в архиве"
              onChange={(e) => {
                setCustomText(e.target.value)
                if (!chipId) setChipId(ARCHIVE_REASON_OTHER_ID)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ready && !locked) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
          </label>
        ) : null}

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
