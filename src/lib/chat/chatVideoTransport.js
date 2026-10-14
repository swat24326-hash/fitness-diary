/**
 * Видеокружок по сети: бинарный POST (тело — сам Blob, метаданные — в адресе) и бинарный ответ «дай файл».
 * Общее для клиента, планшета и телефона тренера; без React.
 */
import { baseVideoMime } from './chatVideoCore.js'

/** 5 МБ с телефона в зале: 15 с обычного запроса мало. */
export const CHAT_VIDEO_FETCH_MS = 90_000

/** Ответ API: видео — { blob, mime }, остальное — JSON (ошибка разбора — пустой объект). */
export async function readApiBody(res) {
  const type = String(res.headers.get('content-type') ?? '')
  if (type.startsWith('video/')) return { blob: await res.blob(), mime: type.split(';')[0].trim() }
  return res.json().catch(() => ({}))
}

export function isVideoOutgoing(outgoing) {
  return Boolean(outgoing?.video)
}

/** Content-Type загрузки: без кодеков; неизвестный тип записи — WebM (сервер всё равно проверит байты). */
export function videoContentType(blob) {
  return baseVideoMime(blob?.type) ?? 'video/webm'
}

/**
 * Адрес отправки: куда (op, kind, client_id / user_id / club_id) + длительность, номер, ответ, «без звука».
 * @param {Record<string, string>} target
 * @param {{ sec: number, client_msg_id?: string, reply_to?: string, silent?: boolean }} outgoing
 */
export function videoUploadQuery(target, outgoing) {
  return {
    ...target,
    sec: String(outgoing.sec),
    ...(outgoing.client_msg_id ? { client_msg_id: outgoing.client_msg_id } : {}),
    ...(outgoing.reply_to ? { reply_to: outgoing.reply_to } : {}),
    ...(outgoing.silent ? { silent: '1' } : {}),
  }
}
