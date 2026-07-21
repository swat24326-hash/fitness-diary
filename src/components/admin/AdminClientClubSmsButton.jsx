import { useCallback, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { sendClubSmsViaApi } from '../../lib/admin/clubSmsService.js'

/**
 * Кнопка клубного SMS (Мои Звонки) в списке клиентов админки.
 * Статус configured передаёт родитель (один GET на страницу).
 * @param {{
 *   clubId: string,
 *   client: { id: string, name?: string, phone?: string | null },
 *   scenario?: string,
 *   configured?: boolean | null,
 *   busy?: boolean,
 *   onFeedback?: (msg: string, tone?: string) => void,
 * }} props
 */
export function AdminClientClubSmsButton({
  clubId,
  client,
  scenario = 'expiring',
  configured = null,
  busy = false,
  onFeedback,
}) {
  const [sending, setSending] = useState(false)
  const hasPhone = Boolean(String(client?.phone ?? '').trim())

  const onClick = useCallback(async () => {
    if (!client?.id || !clubId || sending || busy) return
    if (!hasPhone) {
      onFeedback?.('У клиента нет номера телефона', 'warn')
      return
    }
    if (configured === false) {
      onFeedback?.('Мои Звонки не настроены на сервере (см. docs/MOIZVONKI_SETUP.md)', 'warn')
      return
    }
    setSending(true)
    try {
      await sendClubSmsViaApi({
        clubId,
        clientId: client.id,
        scenario,
      })
      onFeedback?.('SMS отправлено через Мои Звонки (телефон клуба)', 'ok')
    } catch (e) {
      const msg = e?.message || 'Не удалось отправить SMS'
      onFeedback?.(msg, 'warn')
    } finally {
      setSending(false)
    }
  }, [busy, client?.id, clubId, configured, hasPhone, onFeedback, scenario, sending])

  const disabled = busy || sending || !hasPhone || configured === false
  const title =
    configured === false
      ? 'Мои Звонки не настроены на сервере'
      : !hasPhone
        ? 'Нет телефона'
        : sending
          ? 'Отправка…'
          : 'SMS клиенту (Мои Звонки)'

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon-square btn-touch"
      disabled={disabled}
      onClick={() => void onClick()}
      aria-label={title}
      title={title}
    >
      <MessageSquare size={20} aria-hidden />
    </button>
  )
}
