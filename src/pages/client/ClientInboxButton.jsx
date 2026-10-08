import { useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { inboxBadgeText, inboxButtonLabelRu } from '../../lib/client/clientInboxUiCore.js'

/** Конверт в шапке /me: точка с числом, пока есть непрочитанное или непройденный опрос. */
export function ClientInboxButton({ count = 0 }) {
  const navigate = useNavigate()
  const badge = inboxBadgeText(count)
  const label = inboxButtonLabelRu(count)
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon-square btn-touch client-inbox-btn"
      onClick={() => navigate('/me/inbox')}
      title={label}
      aria-label={label}
    >
      <Mail size={20} aria-hidden />
      {badge ? (
        <span className="client-inbox-btn__badge" aria-hidden>
          {badge}
        </span>
      ) : null}
    </button>
  )
}
