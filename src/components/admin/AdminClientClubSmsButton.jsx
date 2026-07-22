import { useCallback, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { AdminClientClubSmsSheet } from './AdminClientClubSmsSheet.jsx'

/**
 * Кнопка клубного SMS (Мои Звонки) — открывает лист подтверждения, не шлёт сразу.
 * @param {{
 *   clubId: string,
 *   client: { id: string, name?: string, phone?: string | null, outreach_name?: string | null, trainer_id?: string | null },
 *   mode?: 'template' | 'custom',
 *   scenario?: string | null,
 *   scenarioLabel?: string,
 *   memList?: object[],
 *   trainerName?: string,
 *   clubName?: string,
 *   membershipName?: string,
 *   today?: string,
 *   templates?: Record<string, string> | null,
 *   configured?: boolean | null,
 *   busy?: boolean,
 *   onFeedback?: (msg: string, tone?: string) => void,
 * }} props
 */
export function AdminClientClubSmsButton({
  clubId,
  client,
  mode = 'custom',
  scenario = null,
  scenarioLabel = '',
  memList = [],
  trainerName = '',
  clubName = '',
  membershipName = 'абонемент',
  today,
  templates = null,
  configured = null,
  busy = false,
  onFeedback,
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
      onFeedback?.('Мои Звонки не настроены на сервере (см. docs/MOIZVONKI_SETUP.md)', 'warn')
      return
    }
    setOpen(true)
  }, [busy, client?.id, clubId, configured, hasPhone, onFeedback])

  const disabled = busy || !hasPhone || configured === false
  const title =
    configured === false
      ? 'Мои Звонки не настроены на сервере'
      : !hasPhone
        ? 'Нет телефона'
        : mode === 'template'
          ? `SMS · ${scenarioLabel || 'шаблон'}`
          : 'SMS клиенту (свой текст)'

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch"
        disabled={disabled}
        onClick={onOpen}
        aria-label={title}
        title={title}
      >
        <MessageSquare size={20} aria-hidden />
      </button>
      <AdminClientClubSmsSheet
        open={open}
        onClose={() => setOpen(false)}
        clubId={clubId}
        client={client}
        mode={mode}
        scenario={scenario}
        scenarioLabel={scenarioLabel}
        memList={memList}
        trainerName={trainerName}
        clubName={clubName}
        membershipName={membershipName}
        today={today}
        templates={templates}
        onFeedback={onFeedback}
      />
    </>
  )
}
