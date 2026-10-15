/**
 * Фото, PDF, видеокружки и стикеры в переписке (клиент, сотрудник, телефон тренера, чат клуба): положить файл,
 * отдать его сутки (стикер — всегда).
 * Доступ к диалогу уже проверил вызывающий handler. Содержимое и имена файлов в лог не пишем — только коды ошибок.
 */
import { randomUUID } from 'node:crypto'
import { sendJson } from '../adminSupabase.js'
import {
  CHAT_ATTACH_BAD_RU,
  CHAT_ATTACH_FAILED_RU,
  CHAT_ATTACH_GONE_RU,
  CHAT_ATTACH_LOAD_FAILED_RU,
  attachStorageKey,
  chatAttachExpiredRu,
  checkAttachBytes,
  isAttachExpired,
  isAttachStorageKey,
} from '../../../src/lib/chat/chatAttachCore.js'
import { loadAttachMessage } from './chatAttachStore.js'
import { storeChatVoice } from './chatVoiceHandler.js'
import { getVoice, putVoice } from './chatVoiceStorage.js'

const fail = (status, error) => ({ ok: false, status, error })

/**
 * Вложение (checkAttachUpload + подпись) → проверка типа по байтам → хранилище. Повтор той же отправки — тот же файл.
 * @param {{ side: 'client' | 'staff', authorId: string, msgId: string | null }} who
 */
export async function storeChatAttach(attach, { side, authorId, msgId }, put = putVoice) {
  const bytes = attach.kind === 'video' ? Buffer.from(attach.buffer) : Buffer.from(attach.data, 'base64')
  const mime = checkAttachBytes(attach.kind, bytes)
  if (!mime) return fail(400, CHAT_ATTACH_BAD_RU)
  const key = attachStorageKey(side, authorId, msgId || randomUUID(), mime, attach.kind)
  if (!isAttachStorageKey(key)) return fail(400, CHAT_ATTACH_BAD_RU)
  try {
    await put(key, bytes, mime)
  } catch (e) {
    console.warn('[chat-attach]', e?.message || e)
    return fail(502, CHAT_ATTACH_FAILED_RU)
  }
  const { kind, name, w, h, caption, sec } = attach
  return { ok: true, attach: { kind, key, mime, bytes: bytes.length, name, w, h, caption, sec: sec ?? null } }
}

/**
 * Файлы сообщения (resolveChatOutgoing) — в хранилище до записи в базу: голосовое или вложение.
 * @returns {Promise<{ ok: true, voice: object|null, attach: object|null } | { ok: false, status: number, error: string }>}
 */
export async function storeChatOutgoing(checked, who) {
  if (checked.voice) {
    const put = await storeChatVoice(checked.voice, who)
    return put.ok ? { ok: true, voice: put.voice, attach: null } : put
  }
  if (checked.attach) {
    const put = await storeChatAttach(checked.attach, who)
    return put.ok ? { ok: true, voice: null, attach: put.attach } : put
  }
  return { ok: true, voice: null, attach: null }
}

/** Файл для пузыря: сутки с отправки, дальше — 410 «удалено». */
export async function attachFileAnswer(message, get = getVoice) {
  if (!message?.attach_kind) return { status: 404, body: { error: CHAT_ATTACH_GONE_RU } }
  const expired = { status: 410, body: { error: chatAttachExpiredRu(message.attach_kind) } }
  if (!isAttachStorageKey(message.attach_key) || isAttachExpired(message.created_at, Date.now(), message.attach_kind)) return expired
  let bytes
  try {
    bytes = await get(message.attach_key)
  } catch (e) {
    console.warn('[chat-attach]', e?.message || e)
    return { status: 502, body: { error: CHAT_ATTACH_LOAD_FAILED_RU } }
  }
  if (!bytes) return expired
  if (message.attach_kind === 'video') return { status: 200, body: { mime: message.attach_mime }, file: bytes }
  return { status: 200, body: { data: bytes.toString('base64'), mime: message.attach_mime, name: message.attach_name ?? null } }
}

/** Ответ «дай файл / звук»: видео — байтами (до 15 МБ, без base64), остальное — JSON. */
export function sendChatFileAnswer(res, out) {
  if (!out.file) {
    sendJson(res, out.status, out.body)
    return
  }
  res.statusCode = out.status
  res.setHeader('Content-Type', out.body.mime)
  res.setHeader('Content-Length', String(out.file.length))
  res.setHeader('Cache-Control', 'private, no-store')
  res.end(out.file)
}

/** @param {'chat_messages' | 'staff_dm_messages' | 'staff_group_messages'} table */
export async function answerChatAttach(db, table, threadId, messageId) {
  return attachFileAnswer(await loadAttachMessage(db, table, threadId, messageId))
}
