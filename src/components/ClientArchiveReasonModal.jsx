import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ARCHIVE_REASON_CHIPS,
  ARCHIVE_REASON_MAX_LEN,
  ARCHIVE_REASON_OTHER_ID,
  buildArchiveReasonConfirmPayload,
  resolveArchiveReasonModalState,
} from '../lib/clientArchiveReasonCore.js'
import {
  ARCHIVE_RETURN_HORIZONS,
  ARCHIVE_RETURN_LATER_ID,
  getClientExpectedReturnOn,
  matchReturnHorizon,
  resolveExpectedReturnOn,
} from '../lib/clientArchiveExpectedReturnCore.js'
import { formatDateRu, todayLocalIso } from '../lib/dateRu.js'
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
 *   onConfirm: (payload: { reason: string, expectedReturnOn: string | null }) => void,
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
  enterTitle = 'Закрыть ПЗ',
  enterConfirmLabel = 'Закрыть ПЗ',
  editTitle = 'Причина закрытия',
  enterHint = 'Закроем направление ПЗ. Если нет других живых залов — клиент попадёт в архив клуба. Причина нужна для статистики.',
}) {
  const titleId = useId()
  const hintId = useId()
  const horizonHintId = useId()
  const inputRef = useRef(null)
  const dateRef = useRef(null)
  const submitGuardRef = useRef(false)
  const [selectedChipId, setSelectedChipId] = useState(null)
  const [customText, setCustomText] = useState('')
  const [horizonId, setHorizonId] = useState(null)
  const [customReturnDate, setCustomReturnDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setSelectedChipId(null)
      setCustomText('')
      setHorizonId(null)
      setCustomReturnDate('')
      setSubmitting(false)
      submitGuardRef.current = false
      return
    }
    const initial = resolveArchiveReasonModalState(initialReason)
    setSelectedChipId(initial.chipId)
    setCustomText(initial.customText)
    if (initial.chipId === ARCHIVE_RETURN_LATER_ID) {
      const existing = getClientExpectedReturnOn({
        expected_return_on: client?.expected_return_on,
        archive_reason: initialReason,
      })
      const matched = matchReturnHorizon(existing)
      setHorizonId(matched.horizonId)
      setCustomReturnDate(matched.customDate || '')
    } else {
      setHorizonId(null)
      setCustomReturnDate('')
    }
    setSubmitting(false)
    submitGuardRef.current = false
  }, [open, initialReason, client?.expected_return_on])

  useEffect(() => {
    if (!open || selectedChipId !== ARCHIVE_REASON_OTHER_ID) return
    const t = window.setTimeout(() => inputRef.current?.focus?.(), 50)
    return () => window.clearTimeout(t)
  }, [open, selectedChipId])

  useEffect(() => {
    if (!open || selectedChipId !== ARCHIVE_RETURN_LATER_ID || horizonId !== 'custom') return
    const t = window.setTimeout(() => dateRef.current?.focus?.(), 50)
    return () => window.clearTimeout(t)
  }, [open, selectedChipId, horizonId])

  useEffect(() => {
    if (!busy) {
      setSubmitting(false)
      submitGuardRef.current = false
    }
  }, [busy])

  const isEnter = mode === 'enter'
  const loyaltyWarn = useLoyaltyArchiveWarn(client, open && isEnter)
  const asOf = todayLocalIso()

  const expectedReturnOn = useMemo(() => {
    if (selectedChipId !== ARCHIVE_RETURN_LATER_ID) return null
    return resolveExpectedReturnOn(asOf, horizonId, customReturnDate)
  }, [selectedChipId, horizonId, customReturnDate, asOf])

  if (!open) return null

  const confirmPayload = buildArchiveReasonConfirmPayload({
    chipId: selectedChipId,
    customText,
    expectedReturnOn,
  })
  const ready = confirmPayload.ok
  const showOtherField = selectedChipId === ARCHIVE_REASON_OTHER_ID
  const showReturnHorizons = selectedChipId === ARCHIVE_RETURN_LATER_ID
  const title = isEnter ? enterTitle : editTitle
  const confirmLabel = isEnter ? enterConfirmLabel : 'Сохранить'
  const locked = busy || submitting

  const pickChip = (chipId) => {
    if (locked) return
    setSelectedChipId(chipId)
    if (chipId !== ARCHIVE_REASON_OTHER_ID) setCustomText('')
    if (chipId !== ARCHIVE_RETURN_LATER_ID) {
      setHorizonId(null)
      setCustomReturnDate('')
    } else if (!horizonId) {
      setHorizonId('1m')
    }
  }

  const pickHorizon = (id) => {
    if (locked) return
    setHorizonId(id)
    if (id !== 'custom') setCustomReturnDate('')
  }

  const submit = () => {
    if (!confirmPayload.ok || locked || submitGuardRef.current) return
    submitGuardRef.current = true
    setSubmitting(true)
    onConfirm?.(confirmPayload.payload)
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
              Закрываем ПЗ у <strong style={{ color: 'var(--text)' }}>{clientName || 'клиента'}</strong>.
              Выберите причину — она попадёт в статистику.
            </>
          ) : (
            <>
              Причина для <strong style={{ color: 'var(--text)' }}>{clientName || 'клиента'}</strong>.
            </>
          )}
        </p>
        {isEnter ? (
          <p className="muted client-archive-reason-modal__note">{enterHint}</p>
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
          {showReturnHorizons
            ? 'Укажите ориентир, когда ждать клиента обратно.'
            : showOtherField
              ? 'Напишите коротко своими словами — поле обязательно.'
              : 'Если ни один вариант не подходит — выберите «Другое».'}
        </p>

        {showReturnHorizons ? (
          <div
            className="client-archive-reason-modal__horizons"
            role="radiogroup"
            aria-labelledby={horizonHintId}
          >
            <p id={horizonHintId} className="client-archive-reason-modal__horizon-title">
              Когда примерно вернётся?
            </p>
            <div className="client-archive-reason-modal__horizon-chips">
              {ARCHIVE_RETURN_HORIZONS.map((h) => {
                const on = horizonId === h.id
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={locked}
                    className={`client-archive-reason-chip client-archive-reason-chip--horizon${on ? ' client-archive-reason-chip--on' : ''}`}
                    onClick={() => pickHorizon(h.id)}
                  >
                    {h.label}
                  </button>
                )
              })}
            </div>
            {horizonId === 'custom' ? (
              <label className="field client-archive-reason-modal__field">
                <span className="label">Дата возврата *</span>
                <input
                  ref={dateRef}
                  className="input"
                  type="date"
                  value={customReturnDate}
                  min={asOf}
                  disabled={locked}
                  onChange={(e) => setCustomReturnDate(e.target.value)}
                />
              </label>
            ) : expectedReturnOn ? (
              <p className="muted client-archive-reason-modal__horizon-preview">
                Ориентир: до {formatDateRu(expectedReturnOn)}
              </p>
            ) : null}
          </div>
        ) : null}

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
