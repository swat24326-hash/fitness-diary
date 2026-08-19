import { useEffect, useId, useRef, useState } from 'react'
import {
  ARCHIVE_REASON_CHIPS,
  ARCHIVE_REASON_MAX_LEN,
  ARCHIVE_REASON_OTHER_ID,
  composeArchiveReason,
  isArchiveReasonReady,
  resolveArchiveReasonModalState,
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
  const hintId = useId()
  const inputRef = useRef(null)
  const submitGuardRef = useRef(false)
  const [selectedChipId, setSelectedChipId] = useState(null)
  const [customText, setCustomText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setSelectedChipId(null)
      setCustomText('')
      setSubmitting(false)
      submitGuardRef.current = false
      return
    }
    const initial = resolveArchiveReasonModalState(initialReason)
    setSelectedChipId(initial.chipId)
    setCustomText(initial.customText)
    setSubmitting(false)
    submitGuardRef.current = false
  }, [open, initialReason])

  useEffect(() => {
    if (!open || selectedChipId !== ARCHIVE_REASON_OTHER_ID) return
    const t = window.setTimeout(() => inputRef.current?.focus?.(), 50)
    return () => window.clearTimeout(t)
  }, [open, selectedChipId])

  useEffect(() => {
    if (!busy) {
      setSubmitting(false)
      submitGuardRef.current = false
    }
  }, [busy])

  const isEnter = mode === 'enter'
  const loyaltyWarn = useLoyaltyArchiveWarn(client, open && isEnter)

  if (!open) return null

  const reason = composeArchiveReason({ chipId: selectedChipId, customText })
  const ready = Boolean(selectedChipId) && isArchiveReasonReady(reason)
  const showOtherField = selectedChipId === ARCHIVE_REASON_OTHER_ID
  const title = isEnter ? 'В архив' : 'Причина архива'
  const confirmLabel = isEnter ? 'В архив' : 'Сохранить'
  const locked = busy || submitting

  const pickChip = (chipId) => {
    if (locked) return
    setSelectedChipId(chipId)
    if (chipId !== ARCHIVE_REASON_OTHER_ID) setCustomText('')
  }

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
              архив. Выберите причину — она попадёт в статистику клуба.
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

        <div
          className="client-archive-reason-modal__chips"
          role="radiogroup"
          aria-labelledby={titleId}
          aria-describedby={hintId}
        >
          {ARCHIVE_REASON_CHIPS.map((chip) => {
            const on = selectedChipId === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={locked}
                className={`client-archive-reason-chip${on ? ' client-archive-reason-chip--on' : ''}`}
                onClick={() => pickChip(chip.id)}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
        <p id={hintId} className="muted client-archive-reason-modal__hint">
          {showOtherField
            ? 'Напишите коротко своими словами — поле обязательно.'
            : 'Если ни один вариант не подходит — выберите «Другое».'}
        </p>

        {showOtherField ? (
          <label className="field client-archive-reason-modal__field">
            <span className="label">Своя причина *</span>
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
