import { Send, Share2 } from 'lucide-react'
import { buildPnkClientMessage, notifyPnkClient } from '../../lib/pnk/pnkClientNotifyCore.js'

/**
 * Написать клиенту ПНК: «В Max» / «Другой мессенджер».
 * @param {{ kind: 'invite' | 'followup', client: object, trainerName?: string, clubName?: string, trialDate?: string, trialTime?: string, busy?: boolean, onResult?: Function }} props
 */
export function PnkClientMessengerButtons({
  kind,
  client,
  trainerName = '',
  clubName = '',
  trialDate,
  trialTime,
  busy = false,
  onResult,
}) {
  async function send(channel) {
    const message = buildPnkClientMessage(kind, {
      client,
      trainerName,
      clubName,
      trialDate,
      trialTime,
    })
    const result = await notifyPnkClient(message, {
      channel,
      clientPhone: client?.phone,
      clientMaxChatUrl: client?.max_chat_url,
    })
    onResult?.(result, message)
  }

  return (
    <div className="pnk-coach-notify" role="group" aria-label="Написать клиенту">
      <button
        type="button"
        className="btn btn-touch pnk-coach-notify__max"
        disabled={busy}
        title="Скопировать и открыть Max"
        onClick={() => void send('max')}
      >
        <Send size={16} aria-hidden />
        В Max
      </button>
      <button
        type="button"
        className="btn btn-touch btn-ghost pnk-coach-notify__other"
        disabled={busy}
        title="Скопировать и открыть «Поделиться»"
        onClick={() => void send('other')}
      >
        <Share2 size={16} aria-hidden />
        Другой мессенджер
      </button>
    </div>
  )
}
