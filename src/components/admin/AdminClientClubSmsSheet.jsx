import { useEffect, useId, useState } from 'react'
import { X } from 'lucide-react'
import { appendClubSmsLog } from '../../lib/admin/clubSmsLogService.js'
import { sendClubSmsViaApi } from '../../lib/admin/clubSmsService.js'
import { resolveClubSmsLogScenario } from '../../lib/admin/clubSmsSentMarkCore.js'
import { resolveClubSmsTemplates } from '../../lib/admin/clubSmsTemplatesCore.js'
import {
  buildOutreachMessage,
  OUTREACH_TEMPLATE_LIMITS,
} from '../../lib/trainer/trainerClientOutreachCore.js'
import '../../styles/club-sms-sheet.css'

const MAX_LEN = OUTREACH_TEMPLATE_LIMITS.maxLength

/**
 * Лист: превью шаблона клуба или свой текст + подтверждение перед SMS.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   clubId: string,
 *   client: { id: string, name?: string, phone?: string | null, outreach_name?: string | null, trainer_id?: string | null },
 *   mode: 'template' | 'custom',
 *   scenario?: string | null,
 *   scenarioLabel?: string,
 *   memList?: object[],
 *   trainerName?: string,
 *   clubName?: string,
 *   membershipName?: string,
 *   today?: string,
 *   templates?: Record<string, string> | null,
 *   onFeedback?: (msg: string, tone?: string) => void,
 *   onSent?: (clientId: string, scenario?: string) => void,
 * }} props
 */
export function AdminClientClubSmsSheet({
  open,
  onClose,
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
  onFeedback,
  onSent,
}) {
  const titleId = useId()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !client) return
    setError('')
    if (mode === 'template' && scenario) {
      const clubTemplates = resolveClubSmsTemplates(templates)
      const preview = buildOutreachMessage(scenario, {
        client,
        memList,
        trainerName,
        clubName: clubName || 'клуб',
        membershipName,
        today,
        templates: clubTemplates,
      })
      setText(preview)
    } else {
      setText('')
    }
  }, [open, client, mode, scenario, memList, trainerName, clubName, membershipName, today, templates])

  if (!open || !client) return null

  const trimmed = text.trim()
  const canSend = trimmed.length > 0 && !sending
  const clubLabel = clubName?.trim() || 'клуба'
  const title =
    mode === 'template' && scenarioLabel
      ? `SMS от ${clubLabel} · ${scenarioLabel}`
      : `SMS от ${clubLabel}`

  const onSend = async () => {
    if (!canSend || !clubId || !client.id) return
    setSending(true)
    setError('')
    try {
      const logScenario = resolveClubSmsLogScenario({
        mode,
        scenario,
        client,
        memList,
        today,
      })
      const sendResult = await sendClubSmsViaApi({
        clubId,
        clientId: client.id,
        text: trimmed.slice(0, MAX_LEN),
        ...(mode === 'template' && scenario ? { scenario } : {}),
      })
      const savedScenario = String(sendResult?.scenario ?? logScenario)
      try {
        await appendClubSmsLog({
          id: sendResult?.log_id || undefined,
          client_id: client.id,
          club_id: clubId,
          scenario: savedScenario,
          message_preview: trimmed.slice(0, 120),
        })
      } catch {
        /* отметка локальная — сбой журнала не ломает успех отправки */
      }
      onSent?.(client.id, savedScenario)
      if (sendResult?.log_warning) {
        onFeedback?.(
          `SMS отправлено, но журнал в облаке не записался: ${String(sendResult.log_warning).slice(0, 120)}`,
          'warn',
        )
      } else {
        onFeedback?.('SMS отправлено через Мои Звонки (телефон клуба)', 'ok')
      }
      onClose()
    } catch (e) {
      setError(e?.message || 'Не удалось отправить SMS')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="club-sms-sheet-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose()
      }}
    >
      <div
        className="club-sms-sheet"
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
              {client.name || 'Клиент'}
              {client.phone ? ` · ${client.phone}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            aria-label="Закрыть"
            disabled={sending}
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className="club-sms-sheet__hint">
          {mode === 'template'
            ? 'Текст от имени клуба (не от тренера). Проверьте и нажмите «Отправить».'
            : 'Напишите текст SMS от клуба. Без подтверждения сообщение не уйдёт.'}
        </p>

        <p className="club-sms-sheet__label">Текст сообщения</p>
        <textarea
          className="club-sms-sheet__text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          placeholder="Текст SMS…"
          disabled={sending}
          aria-label="Текст SMS"
        />
        <p className="club-sms-sheet__count">
          {trimmed.length}/{MAX_LEN}
        </p>

        {error ? <p className="club-sms-sheet__error">{error}</p> : null}

        <div className="club-sms-sheet__actions">
          <button type="button" className="btn btn-ghost btn-touch" disabled={sending} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={!canSend}
            onClick={() => void onSend()}
          >
            {sending ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}
