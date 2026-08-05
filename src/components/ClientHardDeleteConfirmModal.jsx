import { useEffect, useId, useRef, useState } from 'react'
import {
  CLIENT_HARD_DELETE_CONFIRM_CODE,
  isClientHardDeleteConfirmCode,
} from '../lib/clientHardDeleteConfirmCore.js'

/**
 * Модалка жёсткого удаления клиента: без кода 0000 кнопка «Да, удалить» неактивна.
 * @param {{
 *   open: boolean,
 *   clientName?: string,
 *   title?: string,
 *   busy?: boolean,
 *   onCancel: () => void,
 *   onConfirm: () => void,
 *   extraNote?: string,
 *   'aria-labelledby'?: string,
 * }} props
 */
export function ClientHardDeleteConfirmModal({
  open,
  clientName = '',
  title = 'Удалить клиента?',
  busy = false,
  onCancel,
  onConfirm,
  extraNote = 'Удалятся все тренировки, абонементы, замеры тела и медкарта этого клиента. Архив — безопаснее, если человек ещё может вернуться.',
  'aria-labelledby': ariaLabelledBy,
}) {
  const titleId = useId()
  const labelledBy = ariaLabelledBy || titleId
  const [code, setCode] = useState('')
  const inputRef = useRef(null)
  const codeOk = isClientHardDeleteConfirmCode(code)

  useEffect(() => {
    if (!open) {
      setCode('')
      return
    }
    setCode('')
    const t = window.setTimeout(() => inputRef.current?.focus?.(), 50)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={() => !busy && onCancel?.()}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2 id={labelledBy} className="section-title" style={{ marginTop: 0 }}>
          {title}
        </h2>
        <p className="muted" style={{ marginTop: 8 }}>
          Удаляем <strong style={{ color: 'var(--text)' }}>{clientName || 'клиента'}</strong> без возможности
          восстановления.
        </p>
        <p className="muted" style={{ marginTop: 10, fontSize: '0.9rem' }}>
          {extraNote}
        </p>
        <label className="field" style={{ display: 'block', marginTop: 16 }}>
          <span className="label">Для подтверждения введите код {CLIENT_HARD_DELETE_CONFIRM_CODE}</span>
          <input
            ref={inputRef}
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={code}
            disabled={busy}
            placeholder={CLIENT_HARD_DELETE_CONFIRM_CODE}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && codeOk && !busy) {
                e.preventDefault()
                onConfirm?.()
              }
            }}
            aria-label={`Код подтверждения удаления ${CLIENT_HARD_DELETE_CONFIRM_CODE}`}
          />
        </label>
        {!codeOk && code.length > 0 ? (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 13, color: '#fecaca' }}>
            Неверный код
          </p>
        ) : null}
        <div className="row td-modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => onCancel?.()}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-touch"
            style={{ background: 'rgba(248,113,113,0.2)', borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca' }}
            disabled={busy || !codeOk}
            onClick={() => onConfirm?.()}
          >
            {busy ? 'Удаление…' : 'Да, удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}
