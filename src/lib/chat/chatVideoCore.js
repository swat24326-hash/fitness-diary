/**
 * Видеокружки в переписке: до 60 с, живут сутки (вложение attach_kind = 'video', тот же бакет voice/att/).
 * Телефон пишет MP4, если умеет (iPhone, свежий Chrome), иначе WebM — без перекодирования на сервере.
 * Видео уходит одним бинарным POST (не base64 в JSON): метаданные — в адресе запроса.
 * Без React, браузера и базы — общее для сервера и экрана, проверяется verify-chat-video.mjs.
 */
import { formatVoiceTime } from './chatVoiceCore.js'

export const CHAT_VIDEO_MAX_SEC = 60
export const CHAT_VIDEO_MIN_SEC = 1
export const CHAT_VIDEO_WARN_SEC = 10
/** Как PORTABLE_MAX_UPLOAD_BYTES_DEFAULT: минута при ~660 кбит/с ≈ 5 МБ, запас вдвое. */
export const CHAT_VIDEO_MAX_BYTES = 10 * 1024 * 1024
export const CHAT_VIDEO_SIDE = 480
export const CHAT_VIDEO_VIDEO_BPS = 600_000
export const CHAT_VIDEO_AUDIO_BPS = 64_000
const MIN_BYTES = 1000

export const CHAT_VIDEO_BAD_RU = 'Видео не записалось — попробуйте ещё раз'
export const CHAT_VIDEO_BIG_RU = 'Видео слишком большое — запишите покороче'
export const CHAT_VIDEO_SHORT_RU = 'Слишком коротко — удерживайте кнопку, пока снимаете'
export const CHAT_VIDEO_DENIED_RU = 'Нет доступа к камере — разрешите её в настройках браузера'
export const CHAT_VIDEO_NO_CAMERA_RU = 'Камера не найдена'
export const CHAT_VIDEO_UNSUPPORTED_RU = 'Этот браузер не умеет записывать видео'
export const CHAT_VIDEO_OFFLINE_RU = 'Нет сети — видео не записать'
export const CHAT_VIDEO_HOLD_RU = 'Удерживайте, чтобы записать видеосообщение'
export const CHAT_VIDEO_FAILED_RU = 'Не получилось отправить видео — попробуйте ещё раз'
export const CHAT_VIDEO_EXPIRED_RU = 'Видео удалено через сутки'
export const CHAT_VIDEO_MODE_RU = 'Видеосообщение: удерживайте 📹'
export const CHAT_VOICE_MODE_RU = 'Голосовое: удерживайте 🎤'

/** Что просить у MediaRecorder: MP4 играет везде (и на iPhone), WebM — запасной путь старого Chrome / Firefox. */
const RECORDER_MIMES = [
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

/** @param {(mime: string) => boolean} isSupported MediaRecorder.isTypeSupported */
export function pickVideoRecorderMime(isSupported) {
  return RECORDER_MIMES.find((m) => {
    try {
      return isSupported(m)
    } catch {
      return false
    }
  }) ?? null
}

/** 'video/mp4;codecs=…' → 'video/mp4'; не видео — null. */
export function baseVideoMime(raw) {
  const type = String(raw ?? '').split(';')[0].trim().toLowerCase()
  return type === 'video/mp4' || type === 'video/webm' ? type : null
}

/** Тип по первым байтам: MP4 (…ftyp) или WebM (EBML); иначе null. */
export function sniffVideoMime(bytes) {
  if (!bytes || bytes.length < 12) return null
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4'
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm'
  return null
}

/** Длительность от телефона: целые секунды 1–60, иначе null. */
export function normalizeVideoSec(raw) {
  const n = Math.round(Number(raw))
  return Number.isFinite(n) && n >= CHAT_VIDEO_MIN_SEC && n <= CHAT_VIDEO_MAX_SEC ? n : null
}

/**
 * Бинарное тело запроса → видео для хранилища. Только настоящие байты (Buffer) — из JSON видео не приходит.
 * @param {{ bytes: unknown, sec: unknown }} input
 * @returns {{ ok: true, mime: 'video/mp4'|'video/webm', bytes: number, sec: number } | { ok: false, status: number, error: string }}
 */
export function checkVideoUpload({ bytes, sec }) {
  if (!(bytes instanceof Uint8Array) || bytes.length < MIN_BYTES) return { ok: false, status: 400, error: CHAT_VIDEO_BAD_RU }
  if (bytes.length > CHAT_VIDEO_MAX_BYTES) return { ok: false, status: 413, error: CHAT_VIDEO_BIG_RU }
  const mime = sniffVideoMime(bytes)
  if (!mime) return { ok: false, status: 400, error: CHAT_VIDEO_BAD_RU }
  const s = normalizeVideoSec(sec)
  if (!s) return { ok: false, status: 400, error: CHAT_VIDEO_SHORT_RU }
  return { ok: true, mime, bytes: bytes.length, sec: s }
}

/** Подпись сообщения: её видят список диалогов, push, поиск и цитата ответа. */
export function chatVideoLabel(sec) {
  return `📹 Видеосообщение ${formatVoiceTime(sec)}`
}

const one = (v) => (Array.isArray(v) ? v[0] : v)

/**
 * Метаданные отправки видео из адреса запроса (тело — сами байты).
 * @param {Record<string, unknown>} query
 */
export function videoMetaFromQuery(query = {}) {
  const q = (k) => {
    const v = one(query[k])
    return v == null ? '' : String(v)
  }
  return {
    sec: q('sec'),
    client_msg_id: q('client_msg_id') || undefined,
    reply_to: q('reply_to') || undefined,
    silent: q('silent') === '1',
  }
}

/** Запись подходит к концу — таймер жёлтый, последние 10 с. */
export function isVideoEnding(sec) {
  return sec >= CHAT_VIDEO_MAX_SEC - CHAT_VIDEO_WARN_SEC
}
