import { useId, useLayoutEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  CLUB_SMS_CAMPAIGN_MAX_TEXT_LEN,
  buildClubSmsCampaignConfirmSummary,
  normalizeClubSmsCampaignText,
} from '../../lib/admin/clubSmsCampaignCore.js'
import '../../styles/club-sms-sheet.css'
import '../../styles/club-sms-campaign.css'

/**
 * Черновик текста массовой SMS перед окном с кодом.
 *
 * @param {{
 *   open: boolean,
 *   clubName?: string,
 *   scenarioLabel?: string,
 *   initialText?: string,
 *   recipients: Array<{ id: string, name: string }>,
 *   onClose: () => void,
 *   onContinue: (text: string) => void,
 * }} props
 */
export function AdminClubSmsCampaignComposeSheet({
  open,
  clubName = '',
  scenarioLabel = '',
  initialText = '',
  recipients = [],
  onClose,
  onContinue,
}) {
  const titleId = useId()
  const [text, setText] = useState('')

  useLayoutEffect(() => {
    if (!open) return
    setText(String(initialText ?? ''))
  }, [open, initialText])

  if (!open) return null

  const trimmed = normalizeClubSmsCampaignText(text)
  const summary = buildClubSmsCampaignConfirmSummary({ recipients, text: trimmed })
  const clubLabel = String(clubName || '').trim() || 'клуба'
  const title = scenarioLabel
    ? `Массовые SMS · ${scenarioLabel}`
    : `Массовые SMS от ${clubLabel}`

  return (
    <div
      className="club-sms-sheet-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className="club-sms-sheet club-sms-campaign-compose"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="club-sms-sheet__head">
          <div>
            <h2 id={titleId} className="club-sms-sheet__title">
              {title}
            </h2>
            <p className="club-sms-sheet__meta">
              Получателей: {summary.count}
              {summary.durationSec > 0 ? ` · ${summary.durationLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            aria-label="Закрыть"
            onClick={() => onClose?.()}
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <p className="club-sms-sheet__hint">Один текст — всем выбранным. Потом код и отправка.</p>

        <p className="club-sms-sheet__label">Текст</p>
        <textarea
          className="club-sms-sheet__text"
          value={text}
          maxLength={CLUB_SMS_CAMPAIGN_MAX_TEXT_LEN}
          onChange={(e) => setText(e.target.value)}
          placeholder="Текст SMS…"
          aria-label="Текст массовой SMS"
        />
        <p className="club-sms-sheet__count">
          {trimmed.length} / {CLUB_SMS_CAMPAIGN_MAX_TEXT_LEN}
        </p>

        <div className="club-sms-sheet__actions">
          <button type="button" className="btn btn-ghost btn-touch" onClick={() => onClose?.()}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={!summary.canLaunch}
            onClick={() => onContinue?.(trimmed)}
          >
            Далее
          </button>
        </div>
      </div>
    </div>
  )
}
