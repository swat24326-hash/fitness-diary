import { useEffect, useId, useRef, useState } from 'react'
import {
  buildClubSmsCampaignConfirmSummary,
  isClubSmsCampaignConfirmCode,
} from '../../lib/admin/clubSmsCampaignCore.js'
import '../../styles/club-sms-campaign.css'

/**
 * Подтверждение массовой SMS: текст, кому, сколько + код как при удалении.
 *
 * @param {{
 *   open: boolean,
 *   busy?: boolean,
 *   clubName?: string,
 *   recipients: Array<{ id: string, name: string }>,
 *   text: string,
 *   onCancel: () => void,
 *   onConfirm: () => void,
 * }} props
 */
export function AdminClubSmsCampaignConfirmModal({
  open,
  busy = false,
  clubName = '',
  recipients = [],
  text = '',
  onCancel,
  onConfirm,
}) {
  const titleId = useId()
  const [code, setCode] = useState('')
  const inputRef = useRef(null)
  const codeOk = isClubSmsCampaignConfirmCode(code)
  const summary = buildClubSmsCampaignConfirmSummary({ recipients, text })

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

  const clubLabel = String(clubName || '').trim() || 'клуба'
  const canLaunch = summary.canLaunch && codeOk && !busy

  return (
    <div
      className="modal-overlay club-sms-campaign-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => !busy && onCancel?.()}
    >
      <div
        className="modal-panel club-sms-campaign-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="section-title" style={{ marginTop: 0 }}>
          Запустить массовые SMS?
        </h2>
        <p className="muted" style={{ marginTop: 8 }}>
          <strong style={{ color: 'var(--text)' }}>{clubLabel}</strong>
          {' · '}
          <strong style={{ color: 'var(--text)' }}>{summary.count}</strong> SMS
          {summary.durationSec > 0 ? ` · ${summary.durationLabel}` : ''}
        </p>

        <p className="club-sms-campaign-modal__label">Текст</p>
        <pre className="club-sms-campaign-modal__text">{summary.text || '—'}</pre>

        <p className="club-sms-campaign-modal__label">Кому</p>
        <p className="club-sms-campaign-modal__names">
          {summary.namePreview.join(', ') || '—'}
          {summary.namesHidden > 0 ? ` и ещё ${summary.namesHidden}` : ''}
        </p>

        <label className="field" style={{ display: 'block', marginTop: 16 }}>
          <span className="label">Код подтверждения</span>
          <input
            ref={inputRef}
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={code}
            disabled={busy}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canLaunch) {
                e.preventDefault()
                onConfirm?.()
              }
            }}
            aria-label="Код подтверждения массовой SMS"
          />
        </label>
        {!codeOk && code.length > 0 ? (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 13, color: '#fecaca' }}>
            Неверный код
          </p>
        ) : (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
            Тот же код, что при удалении. Без кода очередь не стартует.
          </p>
        )}

        <div className="row td-modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => onCancel?.()}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-touch"
            style={{
              background: 'rgba(46, 255, 184, 0.16)',
              borderColor: 'rgba(46, 255, 184, 0.4)',
              color: 'var(--accent, #2effb8)',
            }}
            disabled={!canLaunch}
            onClick={() => onConfirm?.()}
          >
            {busy ? 'Запуск…' : `Отправить ${summary.count}`}
          </button>
        </div>
      </div>
    </div>
  )
}
