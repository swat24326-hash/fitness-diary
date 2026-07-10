import { RefreshCw } from 'lucide-react'
import { formatSyncOutboundBannerMessage } from '../../lib/syncOutboundLabel.js'
import { requestManualSync } from '../../lib/syncUiBridge.js'

/**
 * @param {{
 *   queue?: number,
 *   localOnly?: number,
 *   total?: number,
 *   onSync?: () => void,
 * }} props
 */
export function TrainerSyncPendingBanner({ queue = 0, localOnly = 0, total, onSync }) {
  const t = Number.isFinite(total) ? total : queue + localOnly
  if (t <= 0) return null

  const message = formatSyncOutboundBannerMessage({ queue, localOnly, total: t })
  const handleSync = () => {
    if (onSync) onSync()
    else requestManualSync()
  }

  return (
    <div className="trainer-sync-banner" role="status" aria-live="polite">
      <p className="trainer-sync-banner__text">{message}</p>
      <button type="button" className="btn btn-primary btn-sm trainer-sync-banner__btn" onClick={handleSync}>
        <RefreshCw size={16} aria-hidden />
        Sync
      </button>
    </div>
  )
}
