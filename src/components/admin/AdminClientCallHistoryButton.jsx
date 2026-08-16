/**
 * Открывает историю звонков клиента (кнопка / иконка → окно сверху).
 */
import { useCallback, useState } from 'react'
import { History } from 'lucide-react'
import { AdminClientCallHistorySheet } from './AdminClientCallHistorySheet.jsx'
import '../../styles/club-call.css'

/**
 * @param {{
 *   clubId: string,
 *   client: { id: string, name?: string, phone?: string | null, club_id?: string },
 *   clubName?: string,
 *   configured?: boolean | null,
 *   reloadToken?: number,
 *   variant?: 'row' | 'icon',
 *   onFeedback?: (msg: string, tone?: string, opts?: { durationMs?: number }) => void,
 *   onCalled?: (clientId: string) => void,
 *   onNoteSaved?: () => void,
 * }} props
 */
export function AdminClientCallHistoryButton({
  clubId,
  client,
  clubName = '',
  configured = null,
  reloadToken = 0,
  variant = 'row',
  onFeedback,
  onCalled,
  onNoteSaved,
}) {
  const [open, setOpen] = useState(false)

  const onOpen = useCallback(() => {
    if (!client?.id || !clubId) return
    setOpen(true)
  }, [client?.id, clubId])

  if (!client?.id || !clubId) return null

  const isIcon = variant === 'icon'

  return (
    <>
      <button
        type="button"
        className={
          isIcon
            ? 'btn btn-ghost btn-icon-square btn-touch club-call-history-btn club-call-history-btn--icon'
            : 'btn btn-ghost btn-touch club-call-history-btn'
        }
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="История связи"
        title="История связи"
      >
        <History size={isIcon ? 16 : 18} aria-hidden />
        {isIcon ? null : <span>История связи</span>}
      </button>
      <AdminClientCallHistorySheet
        open={open}
        onClose={() => setOpen(false)}
        clubId={clubId}
        client={client}
        clubName={clubName}
        configured={configured}
        reloadToken={reloadToken}
        onFeedback={onFeedback}
        onCalled={onCalled}
        onNoteSaved={onNoteSaved}
      />
    </>
  )
}
