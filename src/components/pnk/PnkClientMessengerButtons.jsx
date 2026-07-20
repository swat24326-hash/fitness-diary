import { Send, Share2 } from 'lucide-react'
import { buildPnkClientMessage, notifyPnkClient } from '../../lib/pnk/pnkClientNotifyCore.js'

/**
 * Написать клиенту ПНК: Max / другой мессенджер — только иконки.
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
    <div className="pnk-coach-notify pnk-coach-notify--icons" role="group" aria-label="Написать клиенту">
      <button
        type="button"
        className="btn btn-touch btn-icon-square pnk-coach-notify__max"
        disabled={busy}
        aria-label="В Max"
        title="Скопировать и открыть Max"
        onClick={() => void send('max')}
      >
        <Send size={18} aria-hidden />
      </button>
      <button
        type="button"
        className="btn btn-touch btn-ghost btn-icon-square pnk-coach-notify__other"
        disabled={busy}
        aria-label="Другой мессенджер"
        title="Скопировать и открыть «Поделиться»"
        onClick={() => void send('other')}
      >
        <Share2 size={18} aria-hidden />
      </button>
    </div>
  )
}
