import { Send, Share2 } from 'lucide-react'
import {
  buildPnkCoachNotifyMessage,
  notifyPnkCoach,
  resolvePnkCoachNotifyKind,
} from '../../lib/pnk/pnkCoachNotifyCore.js'

/**
 * Две кнопки как у ДЗ / питания: «В Max» и «Другой мессенджер».
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
    <div className="pnk-coach-notify" role="group" aria-label="Написать тренеру">
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
        title="Скопировать и открыть «Поделиться» — любой мессенджер"
        onClick={() => void send('other')}
      >
        <Share2 size={16} aria-hidden />
        Другой мессенджер
      </button>
    </div>
  )
}
