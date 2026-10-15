/**
 * Голосовые сообщения, как в Telegram: держишь 🎤 — пишется, отпустил — ушло; влево — отмена, вверх — без рук.
 * Телефон пишет звук своим кодеком, как кружок (Opus, на iPhone — AAC); каждый отрезок между паузами — отдельный кусок.
 * Сервер склеивает куски, режет по ручкам обрезки и хранит MP3 (играет везде, его понимает SpeechKit). До 5 минут,
 * слушать — сутки. 15.10.2026: свой MP3-кодировщик в браузере терял звук на Android («металл») — INC-2026-10-15-02.
 * Без React, браузера и базы — общее для сервера и экрана, проверяется verify-chat-voice.mjs.
 */

/** Opus 64 кбит/с моно — запас для голоса (Telegram пишет ~32); 5 минут ≈ 2,4 МБ. */
export const CHAT_VOICE_RECORD_BPS = 64_000
export const CHAT_VOICE_MAX_SEC = 300
export const CHAT_VOICE_MIN_SEC = 1
/** Последние секунды таймер красный. */
export const CHAT_VOICE_WARN_SEC = 15
/** Все куски вместе; в base64 ≈ 4,9 МБ — под потолком тела запроса 5 МБ (PORTABLE_MAX_BODY_BYTES_DEFAULT). */
export const CHAT_VOICE_MAX_BYTES = 3_700_000
/** Кусков (пауза → «дописать») больше не бывает за 5 минут живой записи. */
export const CHAT_VOICE_MAX_PARTS = 30
const MIN_BYTES = 400

/** Что просить у MediaRecorder: Opus (Chrome, Android, Firefox), иначе MP4 / AAC (iPhone). */
const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm']

/** @param {(mime: string) => boolean} isSupported MediaRecorder.isTypeSupported */
export function pickVoiceRecorderMime(isSupported) {
  return (
    RECORDER_MIMES.find((m) => {
      try {
        return isSupported(m)
      } catch {
        return false
      }
    }) ?? null
  )
}

/** Тип звука по первым байтам: MP3 (старые версии приложения), WebM, Ogg, MP4; иначе null. */
export function sniffVoiceMime(bytes) {
  if (!bytes || bytes.length < 12) return null
  if (isMp3Header(bytes)) return 'audio/mpeg'
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio/webm'
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg'
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'audio/mp4'
  return null
}

/** Обрезка от телефона: [с, по] в секундах; не тянули — null; мусор — false. */
export function normalizeVoiceTrim(raw) {
  if (raw == null) return null
  if (!Array.isArray(raw) || raw.length !== 2) return false
  const [from, to] = raw.map(Number)
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > CHAT_VOICE_MAX_SEC + 1 || to - from < CHAT_VOICE_MIN_SEC / 2) return false
  return [Math.round(from * 100) / 100, Math.round(to * 100) / 100]
}
export const CHAT_VOICE_BARS = 48
export const CHAT_VOICE_TTL_MS = 24 * 60 * 60 * 1000
/** Палец ушёл влево на столько — отмена; вверх — запись без рук. */
export const CHAT_VOICE_CANCEL_PX = 90
export const CHAT_VOICE_LOCK_PX = 70
/** Короче — это нажатие, а не удержание: подсказка «Удерживайте». */
export const CHAT_VOICE_TAP_MS = 300
export const CHAT_VOICE_SPEEDS = Object.freeze([1, 1.5, 2])

export const CHAT_VOICE_DENIED_RU = 'Нет доступа к микрофону — разрешите его в настройках браузера'
export const CHAT_VOICE_NO_MIC_RU = 'Микрофон не найден'
export const CHAT_VOICE_OFFLINE_RU = 'Нет сети — голосовое не записать'
export const CHAT_VOICE_HOLD_RU = 'Удерживайте, чтобы записать голосовое'
export const CHAT_VOICE_SHORT_RU = 'Слишком коротко — удерживайте кнопку, пока говорите'
export const CHAT_VOICE_BAD_RU = 'Голосовое не записалось — попробуйте ещё раз'
export const CHAT_VOICE_UNAVAILABLE_RU = 'Голосовые пока недоступны'
export const CHAT_VOICE_FAILED_RU = 'Не получилось отправить голосовое — попробуйте ещё раз'
export const CHAT_VOICE_EXPIRED_RU = 'Голосовое удалено через сутки'
export const CHAT_VOICE_LOAD_FAILED_RU = 'Не получилось загрузить голосовое'
export const CHAT_VOICE_TEXT_BUSY_RU = 'Слишком часто — подождите минуту'
export const CHAT_VOICE_TEXT_FAILED_RU = 'Не получилось расшифровать — попробуйте ещё раз'
export const CHAT_VOICE_TEXT_EMPTY_RU = 'Слов не разобрать'
export const CHAT_VOICE_TEXT_UNAVAILABLE_RU = 'Расшифровка пока недоступна'
export const CHAT_VOICE_GONE_RU = 'Голосовое не найдено'
export const CHAT_VOICE_ONCE_ON_RU = 'Одноразовое: собеседник прослушает его один раз'
export const CHAT_VOICE_ONCE_PLAYED_RU = 'Одноразовое голосовое прослушано'
export const CHAT_VOICE_ONCE_PEER_RU = 'Одноразовое голосовое слушает только собеседник'
export const CHAT_VOICE_ONCE_TEXT_RU = 'Одноразовое голосовое не расшифровывается'

/** -1…1 → 16 бит со знаком (WAV для прослушивания перед отправкой). */
export function pcm16Samples(samples) {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
  }
  return out
}

/** Громкость куска 0…1 для волны: корень из RMS — тихая речь тоже видна. */
export function chatVoiceLevel(samples) {
  if (!samples?.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i]
  return Math.min(1, Math.sqrt(Math.sqrt(sum / samples.length)) * 1.6)
}

/** 7 → «0:07», 125 → «2:05». */
export function formatVoiceTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Текст сообщения: его видят превью в списке, push, поиск и цитата ответа. */
export function chatVoiceLabel(sec, once = false) {
  return `🎤 ${once ? 'Одноразовое голосовое' : 'Голосовое'} ${formatVoiceTime(sec)}`
}

export function isVoiceEnding(sec) {
  return Number(sec) >= CHAT_VOICE_MAX_SEC - CHAT_VOICE_WARN_SEC
}

/** Громкости всей записи (0…1, по кускам) → столбики пузыря 0…100: в каждом — самый громкий кусок. */
export function compressVoiceWave(levels, bars = CHAT_VOICE_BARS) {
  const list = Array.isArray(levels) ? levels : []
  if (!list.length) return Array.from({ length: bars }, () => 0)
  return Array.from({ length: bars }, (_, i) => {
    const from = Math.floor((i * list.length) / bars)
    const to = Math.max(from + 1, Math.floor(((i + 1) * list.length) / bars))
    let peak = 0
    for (let j = from; j < to && j < list.length; j += 1) peak = Math.max(peak, Number(list[j]) || 0)
    return Math.round(Math.max(0, Math.min(1, peak)) * 100)
  })
}

/** Волна от телефона или из базы: ровно CHAT_VOICE_BARS целых 0…100; мусор — null. */
export function normalizeVoiceWave(raw) {
  if (!Array.isArray(raw) || raw.length !== CHAT_VOICE_BARS) return null
  const out = raw.map((v) => Math.round(Number(v)))
  return out.every((v) => Number.isFinite(v)) ? out.map((v) => Math.max(0, Math.min(100, v))) : null
}

/** Начало MP3: тег ID3 или заголовок кадра (11 единичных бит). */
export function isMp3Header(bytes) {
  if (!bytes || bytes.length < 3) return false
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

function base64Bytes(s) {
  return (s.length / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0)
}

const isBase64 = (s) => typeof s === 'string' && s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s)

/**
 * Голосовое от телефона — до того, как класть в хранилище: куски записи (parts, base64) или MP3 старой версии
 * приложения (audio), вместе не больше лимита, длительность 1–300 с, волна, обрезка (trim, секунды).
 * once — одноразовое: собеседник слушает один раз, потом звук недоступен никому.
 * @param {{ parts?: unknown, audio?: unknown, trim?: unknown, sec?: unknown, wave?: unknown, once?: unknown }} input
 * @returns {{ ok: true, parts: string[], trim: [number, number] | null, bytes: number, sec: number, wave: number[], once: boolean }
 *   | { ok: false, status: number, error: string }}
 */
export function checkVoiceUpload(input) {
  const parts = Array.isArray(input?.parts) ? input.parts : typeof input?.audio === 'string' ? [input.audio] : []
  if (!parts.length || parts.length > CHAT_VOICE_MAX_PARTS || !parts.every(isBase64)) return { ok: false, status: 400, error: CHAT_VOICE_BAD_RU }
  const bytes = parts.reduce((n, p) => n + base64Bytes(p), 0)
  if (bytes < MIN_BYTES) return { ok: false, status: 400, error: CHAT_VOICE_SHORT_RU }
  if (bytes > CHAT_VOICE_MAX_BYTES) return { ok: false, status: 413, error: CHAT_VOICE_BAD_RU }
  const sec = Math.round(Number(input?.sec))
  if (!Number.isFinite(sec) || sec < CHAT_VOICE_MIN_SEC) return { ok: false, status: 400, error: CHAT_VOICE_SHORT_RU }
  if (sec > CHAT_VOICE_MAX_SEC) return { ok: false, status: 413, error: CHAT_VOICE_BAD_RU }
  const wave = normalizeVoiceWave(input?.wave)
  if (!wave) return { ok: false, status: 400, error: CHAT_VOICE_BAD_RU }
  const trim = normalizeVoiceTrim(input?.trim)
  if (trim === false) return { ok: false, status: 400, error: CHAT_VOICE_BAD_RU }
  return { ok: true, parts, trim, bytes, sec, wave, once: input?.once === true }
}

const KEY_RE = /^voice\/[cu]-[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/

/** Файл в хранилище: автор + номер отправки (повтор той же отправки перезапишет тот же файл). */
export function voiceStorageKey(side, authorId, msgId) {
  return `voice/${side === 'client' ? 'c' : 'u'}-${String(authorId).toLowerCase()}/${String(msgId).toLowerCase()}.mp3`
}

export function isVoiceStorageKey(key) {
  return KEY_RE.test(String(key ?? ''))
}

/** Слушать можно сутки с отправки; дальше файл удаляет правило бакета, сервер его уже не отдаёт. */
export function isVoiceExpired(createdAt, now = Date.now()) {
  const at = Date.parse(String(createdAt ?? ''))
  return !Number.isFinite(at) || now - at >= CHAT_VOICE_TTL_MS
}

/**
 * Голосовое в сообщении для экрана; ключ хранилища наружу не отдаём. Не голосовое — null.
 * text: null — не расшифровывали, '' — слов не разобрать. played — собеседник автора уже слушал (точка гаснет у обоих).
 * once — одноразовое: без текста, прослушали — expired у обоих.
 */
export function buildVoiceView(m, now = Date.now()) {
  const sec = Number(m?.voice_sec)
  if (!(sec > 0)) return null
  const once = m.voice_once === true
  const played = Boolean(m.voice_played_at)
  return {
    sec,
    wave: normalizeVoiceWave(m.voice_wave) ?? compressVoiceWave([]),
    text: !once && typeof m.voice_text === 'string' ? m.voice_text : null,
    expired: !m.voice_key || isVoiceExpired(m.created_at, now) || (once && played),
    played,
    once,
  }
}

/**
 * Одноразовое: звук отдаём только собеседнику автора и только до первого прослушивания; текст — никогда.
 * Автор, чужой просмотр (главный админ, mark: false) и повтор — отказ. Не одноразовое — null.
 * @param {'audio' | 'text'} want
 * @returns {{ status: number, error: string } | null}
 */
export function voiceOnceRefusal(message, listener, want = 'audio') {
  if (message?.voice_once !== true) return null
  if (want === 'text') return { status: 403, error: CHAT_VOICE_ONCE_TEXT_RU }
  if (message.voice_played_at) return { status: 410, error: CHAT_VOICE_ONCE_PLAYED_RU }
  if (!voiceHeardBy(message, listener)) return { status: 403, error: CHAT_VOICE_ONCE_PEER_RU }
  return null
}

/**
 * Отметить «прослушано», когда звук берёт собеседник автора: в диалоге с клиентом — другая сторона,
 * в личной переписке — не автор. Свои, уже прослушанные и чужой просмотр (mark: false) — нет.
 * @param {{ side?: 'client'|'staff', userId?: string, mark?: boolean }} listener
 */
export function voiceHeardBy(message, listener) {
  if (!message?.voice_sec || message.voice_played_at || listener?.mark === false) return false
  if (listener?.side) return Boolean(message.author_side) && message.author_side !== listener.side
  if (listener?.userId) return String(message.author_user_id ?? '') !== String(listener.userId)
  return false
}

/** Куда ушёл палец от кнопки: влево — отмена, вверх — без рук, иначе держит. */
export function voiceGesture(dx, dy) {
  if (dx <= -CHAT_VOICE_CANCEL_PX) return 'cancel'
  if (dy <= -CHAT_VOICE_LOCK_PX && Math.abs(dx) < CHAT_VOICE_CANCEL_PX / 2) return 'lock'
  return 'hold'
}

/** Насколько «‹ отмена» уехала за пальцем: 0…1. */
export function voiceCancelProgress(dx) {
  return Math.max(0, Math.min(1, -Number(dx || 0) / CHAT_VOICE_CANCEL_PX))
}

export function voiceLockProgress(dy) {
  return Math.max(0, Math.min(1, -Number(dy || 0) / CHAT_VOICE_LOCK_PX))
}

export function isVoiceTap(heldMs) {
  return Number(heldMs) < CHAT_VOICE_TAP_MS
}

/** 1x → 1.5x → 2x → 1x. */
export function nextVoiceSpeed(speed) {
  const i = CHAT_VOICE_SPEEDS.indexOf(Number(speed))
  return CHAT_VOICE_SPEEDS[(i + 1) % CHAT_VOICE_SPEEDS.length]
}

/** Нажатие по волне → доля записи 0…1. */
export function voiceSeekRatio(x, width) {
  if (!(width > 0)) return 0
  return Math.max(0, Math.min(1, Number(x) / width))
}
