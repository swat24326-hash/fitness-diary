/**
 * Стикеры переписки: закрытый набор клуба. В сообщении — только id из этого списка,
 * текст сообщения сервер берёт из подписи (её видят push, превью в списке и старые экраны). Без React.
 */
import { normalizeChatBody } from './chatMessageCore.js'

export const CHAT_STICKER_GROUPS = Object.freeze([
  { id: 'practical', label: 'По делу' },
  { id: 'mood', label: 'Настроение' },
])

export const CHAT_STICKERS = Object.freeze([
  { id: 'late', group: 'practical', label: 'Опаздываю ~10 минут' },
  { id: 'cant-come', group: 'practical', label: 'Сегодня не смогу' },
  { id: 'coming', group: 'practical', label: 'Буду!' },
  { id: 'reschedule', group: 'practical', label: 'Перенесём?' },
  { id: 'see-you', group: 'practical', label: 'Жду на тренировке' },
  { id: 'thanks', group: 'practical', label: 'Спасибо!' },
  { id: 'record', group: 'mood', label: 'Рекорд!' },
  { id: 'fire', group: 'mood', label: 'Огонь!' },
  { id: 'done', group: 'mood', label: 'Сделано!' },
  { id: 'tired', group: 'mood', label: 'Устал, но сделал' },
  { id: 'water', group: 'mood', label: 'Пей воду' },
  { id: 'great', group: 'mood', label: 'Отличная работа' },
])

const BY_ID = new Map(CHAT_STICKERS.map((s) => [s.id, s]))

export function isChatSticker(id) {
  return BY_ID.has(String(id ?? ''))
}

export function chatStickerLabel(id) {
  return BY_ID.get(String(id ?? ''))?.label ?? ''
}

/**
 * Что сохранить: стикер (текст = подпись) или обычный текст. Чужой id стикера — ошибка, не текст.
 * @param {{ body?: unknown, sticker?: unknown }} input
 * @returns {{ ok: true, body: string, sticker: string|null } | { ok: false, error: string }}
 */
export function resolveChatOutgoing(input) {
  const sticker = input?.sticker
  if (sticker != null && sticker !== '') {
    if (!isChatSticker(sticker)) return { ok: false, error: 'Такого стикера нет — обновите приложение' }
    return { ok: true, body: chatStickerLabel(sticker), sticker: String(sticker) }
  }
  const checked = normalizeChatBody(input?.body)
  return checked.ok ? { ok: true, body: checked.body, sticker: null } : checked
}
