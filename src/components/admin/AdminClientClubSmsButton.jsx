import { useCallback, useState } from 'react'
import { Check, MessageSquare } from 'lucide-react'
import { AdminClientClubSmsSheet } from './AdminClientClubSmsSheet.jsx'
import '../../styles/club-sms-sent-mark.css'

/**
 * Кнопка клубного SMS (Мои Звонки) — открывает лист подтверждения, не шлёт сразу.
 * Отметка: в «Истекает» / «Давно не был» — на окно фильтра; иначе только сегодня.
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
 *   sentMarked?: boolean,
 *   markChipLabel?: string,
 *   markTitle?: string,
 *   onFeedback?: (msg: string, tone?: string) => void,
 *   onSent?: (clientId: string, scenario?: string) => void,
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
  sentMarked = false,
  markChipLabel = 'сегодня',
  markTitle = 'SMS отправлено сегодня с этого устройства',
  onFeedback,
  onSent,
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
        : sentMarked
          ? markTitle
          : mode === 'template'
            ? `SMS · ${scenarioLabel || 'шаблон'}`
            : 'SMS клиенту (свой текст)'

  return (
    <>
      <span className={`admin-client-sms-wrap${sentMarked ? ' admin-client-sms-wrap--sent' : ''}`}>
        <button
          type="button"
          className={`btn btn-ghost btn-icon-square btn-touch${sentMarked ? ' admin-client-sms-btn--sent' : ''}`}
          disabled={disabled}
          onClick={onOpen}
          aria-label={title}
          title={title}
        >
          <MessageSquare size={20} aria-hidden />
        </button>
        {sentMarked ? (
          <span className="admin-client-sms-mark" title={markTitle}>
            <Check size={11} strokeWidth={3} aria-hidden />
            <span className="admin-client-sms-mark__text">{markChipLabel}</span>
          </span>
        ) : null}
      </span>
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
        onSent={onSent}
      />
    </>
  )
}
