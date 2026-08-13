import { useId } from 'react'
import { buildClubSmsCampaignResultSummary } from '../../lib/admin/clubSmsCampaignResultCore.js'
import '../../styles/club-sms-campaign.css'

/**
 * Итог массовой SMS: сколько ушло / не ушло + список ошибок.
 *
 * @param {{
 *   open: boolean,
 *   result: {
 *     ok?: number,
 *     fail?: number,
 *     aborted?: boolean,
 *     errors?: Array<{ id?: string, name?: string, error?: string }>,
 *   } | null,
 *   recipientsCount?: number,
 *   onClose: () => void,
 *   onOpenJournal?: () => void,
 * }} props
 */
export function AdminClubSmsCampaignResultModal({
  open,
  result,
  recipientsCount = 0,
  onClose,
  onOpenJournal,
}) {
  const titleId = useId()
  if (!open || !result) return null

  const summary = buildClubSmsCampaignResultSummary(result, { recipientsCount })
  const toneClass =
    summary.tone === 'err'
      ? ' club-sms-campaign-result--err'
      : summary.tone === 'warn'
        ? ' club-sms-campaign-result--warn'
        : ' club-sms-campaign-result--ok'

  return (
    <div
      className="modal-overlay club-sms-campaign-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => onClose?.()}
    >
      <div
        className={`modal-panel club-sms-campaign-modal club-sms-campaign-result${toneClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="section-title" style={{ marginTop: 0 }}>
          {summary.title}
        </h2>
        <p className="club-sms-campaign-result__headline">{summary.headline}</p>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Успешные и ошибки сохраняются в журнале SMS клуба (Max и SMS).
        </p>

        {summary.hasErrors ? (
          <>
            <p className="club-sms-campaign-modal__label">Не ушло</p>
            <ul className="club-sms-campaign-result__errors" aria-label="Ошибки отправки">
              {summary.errors.map((row) => (
                <li key={row.id || `${row.name}-${row.error}`} className="club-sms-campaign-result__error">
                  <strong>{row.name}</strong>
                  <span className="muted">{row.error}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="row td-modal-actions" style={{ marginTop: 18 }}>
          {typeof onOpenJournal === 'function' ? (
            <button type="button" className="btn btn-ghost btn-touch" onClick={() => onOpenJournal?.()}>
              Журнал SMS
            </button>
          ) : null}
          <button type="button" className="btn btn-primary btn-touch" onClick={() => onClose?.()}>
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}
