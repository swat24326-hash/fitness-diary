import { useCallback, useState } from 'react'
import { Phone } from 'lucide-react'
import { AdminClientClubCallSheet } from './AdminClientClubCallSheet.jsx'
import '../../styles/club-call.css'

/**
 * Кнопка клубного звонка (Мои Звонки) — открывает подтверждение, не звонит сразу.
 *
 * @param {{
 *   clubId: string,
 *   client: { id: string, name?: string, phone?: string | null },
 *   clubName?: string,
 *   configured?: boolean | null,
 *   busy?: boolean,
 *   onFeedback?: (msg: string, tone?: string) => void,
 *   onCalled?: (clientId: string) => void,
 *   onNoteSaved?: () => void,
 * }} props
 */
export function AdminClientClubCallButton({
  clubId,
  client,
  clubName = '',
  configured = null,
  busy = false,
  onFeedback,
  onCalled,
  onNoteSaved,
}) {
  const [open, setOpen] = useState(false)
  const hasPhone = Boolean(String(client?.phone ?? '').trim())

  const onOpen = useCallback(() => {
    if (!client?.id || !clubId || busy) return
    if (!hasPhone) {
      onFeedback?.('У клиента нет номера телефона', 'warn')
      return
    }
    if (configured === false) {
      onFeedback?.('Мои Звонки не настроены для клуба (Структура → Max и SMS)', 'warn')
      return
    }
    setOpen(true)
  }, [busy, client?.id, clubId, configured, hasPhone, onFeedback])

  const disabled = busy || !hasPhone || configured === false

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch club-call-btn"
        onClick={onOpen}
        disabled={disabled}
        aria-label="Позвонить с телефона клуба"
        title={
          configured === false
            ? 'Мои Звонки не настроены'
            : !hasPhone
              ? 'Нет номера телефона'
              : 'Позвонить с телефона клуба'
        }
      >
        <Phone size={18} aria-hidden />
      </button>
      <AdminClientClubCallSheet
        open={open}
        onClose={() => setOpen(false)}
        clubId={clubId}
        client={client}
        clubName={clubName}
        onFeedback={onFeedback}
        onCalled={onCalled}
        onNoteSaved={onNoteSaved}
      />
    </>
  )
}
