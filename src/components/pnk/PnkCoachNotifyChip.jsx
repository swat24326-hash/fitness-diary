import { Send, Share2 } from 'lucide-react'
import {
  buildPnkCoachNotifyMessage,
  notifyPnkCoach,
  resolvePnkCoachNotifyKind,
} from '../../lib/pnk/pnkCoachNotifyCore.js'

/**
 * Написать тренеру: Max / другой мессенджер — только иконки.
 */
export function PnkCoachNotifyChip({
  client,
  trainerName,
  trainerPhone,
  trainerMaxChatUrl,
  managerName,
  clubName,
  kind: kindOverride,
  busy = false,
  onResult,
}) {
  async function send(channel) {
    const kind = kindOverride || resolvePnkCoachNotifyKind(client)
    const message = buildPnkCoachNotifyMessage(kind, {
      client,
      trainerName,
      managerName,
      clubName,
    })
    const result = await notifyPnkCoach(message, {
      channel,
      trainerPhone,
      trainerMaxChatUrl,
    })
    onResult?.(result, message)
  }

  return (
    <div className="pnk-coach-notify pnk-coach-notify--icons" role="group" aria-label="Написать тренеру">
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
        title="Скопировать и открыть «Поделиться» — любой мессенджер"
        onClick={() => void send('other')}
      >
        <Share2 size={18} aria-hidden />
      </button>
    </div>
  )
}
