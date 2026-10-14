/**
 * Стикеры переписки: закрытый набор клуба. В сообщении — только id из этого списка,
 * текст сообщения сервер берёт из подписи (её видят push, превью в списке и старые экраны). Без React.
 */
import { normalizeChatBody } from './chatMessageCore.js'
import { chatAttachLabel, checkAttachUpload, normalizeAttachCaption } from './chatAttachCore.js'
import { chatVoiceLabel, checkVoiceUpload } from './chatVoiceCore.js'

export const CHAT_STICKER_GROUPS = Object.freeze([
  { id: 'practical', label: 'По делу' },
  { id: 'mood', label: 'Настроение' },
  { id: 'gym', label: 'Зал' },
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
  // art — растровый анимированный стикер (public/stickers/art/<id>.webp), рисунок в components/chat/stickers/art/.
  { id: 'glutes', group: 'gym', label: 'Ягодицы сами себя не накачают', art: true },
  { id: 'dance', group: 'gym', label: 'Когда в зале включили мой трек', art: true },
  { id: 'shake', group: 'gym', label: 'Замешиваю протеин', art: true },
  { id: 'no-legs', group: 'gym', label: 'Ноги? Не, не слышал', art: true },
  { id: 'strut', group: 'gym', label: 'После первой тренировки', art: true },
])

const BY_ID = new Map(CHAT_STICKERS.map((s) => [s.id, s]))

export function isChatSticker(id) {
  return BY_ID.has(String(id ?? ''))
}

export function chatStickerLabel(id) {
  return BY_ID.get(String(id ?? ''))?.label ?? ''
}

export function isChatArtSticker(id) {
  return BY_ID.get(String(id ?? ''))?.art === true
}

/**
 * Что сохранить: голосовое (текст = «🎤 Голосовое 0:42»), фото / PDF (текст = «📷 подпись», body — подпись),
 * стикер (текст = подпись стикера) или обычный текст. Чужой id стикера — ошибка, не текст.
 * @param {{ body?: unknown, sticker?: unknown, audio?: unknown, sec?: unknown, wave?: unknown, once?: unknown, attach?: unknown }} input
 * @returns {{ ok: true, body: string, sticker: string|null, voice: ReturnType<typeof checkVoiceUpload> & { ok: true } | null,
 *   attach: (ReturnType<typeof checkAttachUpload> & { ok: true, caption: string }) | null }
 *   | { ok: false, error: string, status?: number }}
 */
export function resolveChatOutgoing(input) {
  if (input?.audio != null) {
    const voice = checkVoiceUpload(input)
    return voice.ok ? { ok: true, body: chatVoiceLabel(voice.sec, voice.once), sticker: null, voice, attach: null } : voice
  }
  if (input?.attach != null) {
    const attach = checkAttachUpload(input.attach)
    if (!attach.ok) return attach
    const cap = normalizeAttachCaption(input?.body)
    if (!cap.ok) return cap
    return { ok: true, body: chatAttachLabel(attach.kind, attach.name, cap.caption), sticker: null, voice: null, attach: { ...attach, caption: cap.caption } }
  }
  const sticker = input?.sticker
  if (sticker != null && sticker !== '') {
    if (!isChatSticker(sticker)) return { ok: false, error: 'Такого стикера нет — обновите приложение' }
    return { ok: true, body: chatStickerLabel(sticker), sticker: String(sticker), voice: null, attach: null }
  }
  const checked = normalizeChatBody(input?.body)
  return checked.ok ? { ok: true, body: checked.body, sticker: null, voice: null, attach: null } : checked
}
