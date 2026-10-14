/**
 * Вложения в переписке: фото и PDF. Живут сутки, как звук голосовых (тот же бакет, префикс voice/att/ под правилом удаления).
 * Фото телефон ужимает сам (chatAttachPrepare.js), сервер проверяет тип по первым байтам, а не по имени.
 * Без React, браузера и базы — общее для сервера и экрана, проверяется verify-chat-attach.mjs.
 */
import { CHAT_VOICE_TTL_MS } from './chatVoiceCore.js'
import { checkVideoUpload, chatVideoLabel, sniffVideoMime } from './chatVideoCore.js'

/** Тело запроса — JSON до 5 МБ, base64 раздувает на треть: 3,5 МБ файла ≈ 4,7 МБ запроса. */
export const CHAT_FILE_MAX_BYTES = 3_500_000
export const CHAT_PHOTO_MAX_BYTES = 1_500_000
export const CHAT_PHOTO_MAX_SIDE = 1600
export const CHAT_CAPTION_MAX = 1000
const NAME_MAX = 80
const MIN_BYTES = 100

export const CHAT_ATTACH_BAD_RU = 'Файл не подходит — можно фото или PDF'
export const CHAT_ATTACH_BIG_RU = 'Файл больше 3,5 МБ — сожмите его или отправьте фото страниц'
export const CHAT_ATTACH_PHOTO_BAD_RU = 'Фото не открылось — попробуйте другое'
export const CHAT_ATTACH_UNAVAILABLE_RU = 'Фото и файлы пока недоступны'
export const CHAT_ATTACH_FAILED_RU = 'Не получилось отправить — попробуйте ещё раз'
export const CHAT_ATTACH_LOAD_FAILED_RU = 'Не получилось загрузить'
export const CHAT_ATTACH_GONE_RU = 'Вложение не найдено'
export const CHAT_ATTACH_CAPTION_LONG_RU = `Подпись длиннее ${CHAT_CAPTION_MAX} символов — сократите её`
export const CHAT_ATTACH_TTL_HINT_RU = 'Фото и файлы хранятся сутки'

/** @param {'photo'|'file'|'video'} kind */
export function chatAttachExpiredRu(kind) {
  if (kind === 'video') return 'Видео удалено через сутки'
  return kind === 'photo' ? 'Фото удалено через сутки' : 'Файл удалён через сутки'
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/webm': 'webm' }
const ATTACH_KINDS = new Set(['photo', 'file', 'video'])
const KIND_MIMES = { photo: ['image/jpeg', 'image/png', 'image/webp'], file: ['application/pdf'], video: ['video/mp4', 'video/webm'] }

/** Тип по первым байтам: JPEG, PNG, WebP, PDF, MP4 или WebM; иначе null (HTML, SVG, программы — не принимаем). */
export function sniffAttachMime(bytes) {
  if (!bytes || bytes.length < 12) return null
  const at = (i, list) => list.every((b, j) => bytes[i + j] === b)
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  return sniffVideoMime(bytes)
}

/** Тип подходит к виду вложения: фото — картинка, файл — только PDF. */
export function attachMimeFits(kind, mime) {
  return Boolean(KIND_MIMES[kind]?.includes(mime))
}

function base64Bytes(s) {
  return (s.length / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0)
}

/** Имя PDF для плашки: без пути и служебных символов, с .pdf, до 80 знаков. */
export function cleanAttachName(raw) {
  const base = String(raw ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/[<>:"|?*]/g, '')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  const stem = base.replace(/\.pdf$/i, '').slice(0, NAME_MAX - 4).trim() || 'Документ'
  return `${stem}.pdf`
}

const side = (v) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : null
}

/**
 * Вложение от телефона — до хранилища: base64 не больше лимита вида, размеры фото, имя файла.
 * Тип по байтам проверяет сервер (checkAttachBytes) — base64 тут ещё не раскрыт.
 * @param {{ kind?: unknown, data?: unknown, name?: unknown, w?: unknown, h?: unknown }} input
 * @returns {{ ok: true, kind: 'photo'|'file', data: string, bytes: number, name: string|null, w: number|null, h: number|null }
 *   | { ok: false, status: number, error: string }}
 */
export function checkAttachUpload(input) {
  if (input?.kind === 'video') {
    const video = checkVideoUpload({ bytes: input.buffer, sec: input.sec })
    if (!video.ok) return video
    return { ok: true, kind: 'video', buffer: input.buffer, bytes: video.bytes, sec: video.sec, name: null, w: null, h: null }
  }
  const kind = input?.kind === 'photo' || input?.kind === 'file' ? input.kind : null
  const data = typeof input?.data === 'string' ? input.data : ''
  if (!kind || !data || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, status: 400, error: CHAT_ATTACH_BAD_RU }
  const bytes = base64Bytes(data)
  if (bytes < MIN_BYTES) return { ok: false, status: 400, error: CHAT_ATTACH_BAD_RU }
  if (bytes > (kind === 'photo' ? CHAT_PHOTO_MAX_BYTES : CHAT_FILE_MAX_BYTES)) return { ok: false, status: 413, error: CHAT_ATTACH_BIG_RU }
  if (kind === 'file') return { ok: true, kind, data, bytes, name: cleanAttachName(input?.name), w: null, h: null }
  const w = side(input?.w)
  const h = side(input?.h)
  if (!w || !h) return { ok: false, status: 400, error: CHAT_ATTACH_PHOTO_BAD_RU }
  return { ok: true, kind, data, bytes, name: null, w, h }
}

/** Сервер раскрыл base64: тип по байтам подходит к виду — mime, иначе null. */
export function checkAttachBytes(kind, bytes) {
  const mime = sniffAttachMime(bytes)
  return mime && attachMimeFits(kind, mime) ? mime : null
}

/** Подпись под вложением (необязательна): тот же текст, что в поле ввода, до 1000 символов. */
export function normalizeAttachCaption(raw) {
  const caption = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (caption.length > CHAT_CAPTION_MAX) return { ok: false, status: 400, error: CHAT_ATTACH_CAPTION_LONG_RU }
  return { ok: true, caption }
}

/** Текст сообщения: его видят список диалогов, push, поиск и цитата ответа. */
export function chatAttachLabel(kind, name, caption = '', sec = 0) {
  if (kind === 'video') return caption ? `${chatVideoLabel(sec)} · ${caption}` : chatVideoLabel(sec)
  if (kind === 'photo') return caption ? `📷 ${caption}` : '📷 Фото'
  return caption ? `📎 ${name} · ${caption}` : `📎 ${name}`
}

const KEY_RE = /^voice\/att\/[cu]-[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf|mp4|webm)$/

/** Файл в хранилище: под префиксом voice/ — правило бакета удаляет его через сутки, как звук. */
export function attachStorageKey(authorSide, authorId, msgId, mime) {
  return `voice/att/${authorSide === 'client' ? 'c' : 'u'}-${String(authorId).toLowerCase()}/${String(msgId).toLowerCase()}.${EXT[mime] ?? 'bin'}`
}

export function isAttachStorageKey(key) {
  return KEY_RE.test(String(key ?? ''))
}

export function isAttachExpired(createdAt, now = Date.now()) {
  const at = Date.parse(String(createdAt ?? ''))
  return !Number.isFinite(at) || now - at >= CHAT_VOICE_TTL_MS
}

/** Вложение в сообщении для экрана; ключ хранилища наружу не отдаём. Без вложения — null. */
export function buildAttachView(m, now = Date.now()) {
  if (!ATTACH_KINDS.has(m?.attach_kind)) return null
  return {
    kind: m.attach_kind,
    mime: String(m.attach_mime ?? ''),
    name: m.attach_name ?? null,
    bytes: Number(m.attach_bytes) || 0,
    w: Number(m.attach_w) || null,
    h: Number(m.attach_h) || null,
    sec: Number(m.attach_sec) || null,
    caption: typeof m.attach_caption === 'string' ? m.attach_caption : '',
    expired: !m.attach_key || isAttachExpired(m.created_at, now),
  }
}

/** 340 000 → «332 КБ», 1 250 000 → «1,2 МБ». */
export function formatAttachSize(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} КБ`
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
}

/** Фото больше лимита стороны — уменьшить до него (для canvas перед сжатием). */
export function scaleToMaxSide(w, h, max = CHAT_PHOTO_MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}
