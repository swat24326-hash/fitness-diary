/**
 * Голосовые сообщения, как в Telegram: держишь 🎤 — пишется, отпустил — ушло; влево — отмена, вверх — без рук.
 * Звук — MP3 24 кГц моно (играет на iPhone, Android и ПК, его же понимает SpeechKit), до 5 минут, слушать — сутки.
 * 16 кГц резал всё выше 8 кГц — «с», «ш» звучали глухо, как в телефонной трубке.
 * Без React, браузера и базы — общее для сервера и экрана, проверяется verify-chat-voice.mjs.
 */

export const CHAT_VOICE_RATE = 24000
/** 48 кбит/с на полосу 24 кГц мало: MP3 «звенит металлом», как из-под воды (Android, 15.10.2026). */
export const CHAT_VOICE_KBPS = 64
export const CHAT_VOICE_MAX_SEC = 300
export const CHAT_VOICE_MIN_SEC = 1
/** Последние секунды таймер красный. */
export const CHAT_VOICE_WARN_SEC = 15
/** 5 минут при 64 кбит/с ≈ 2,4 МБ; запас на заголовки и округления (в base64 — до 3,5 МБ, под потолком тела 5 МБ). */
export const CHAT_VOICE_MAX_BYTES = 2_600_000
const MIN_BYTES = 400
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

/**
 * Частота микрофона (44,1 / 48 кГц, гарнитура — 16 кГц) → 24 кГц, кусок за куском без швов: позиция и последний
 * отсчёт переходят в следующий кусок, иначе на каждом стыке щелчок и запись «уезжает» по времени.
 * Верх выше 12 кГц срезают фильтры до пересчёта (chatVoiceRecorder.js).
 */
export function createPcmResampler(inRate, outRate = CHAT_VOICE_RATE) {
  const step = inRate / outRate
  let pos = 0
  let last = 0
  return (input) => {
    if (!input?.length || !(step > 0)) return new Float32Array(0)
    if (step === 1) return Float32Array.from(input)
    const end = input.length - 1
    const out = new Float32Array(Math.max(0, Math.ceil((end - pos) / step)))
    let n = 0
    for (; pos < end && n < out.length; pos += step, n += 1) {
      const i = Math.floor(pos)
      const a = i < 0 ? last : input[i]
      out[n] = a + (input[i + 1] - a) * (pos - i)
    }
    pos -= input.length
    last = input[end]
    return out.subarray(0, n)
  }
}

/** -1…1 → 16 бит со знаком (то, что берёт MP3-кодировщик). */
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

/**
 * Голосовое от телефона — до того, как класть в хранилище: base64 MP3 не больше лимита, длительность 1–300 с, волна.
 * once — одноразовое: собеседник слушает один раз, потом звук недоступен никому.
 * @param {{ audio?: unknown, sec?: unknown, wave?: unknown, once?: unknown }} input
 * @returns {{ ok: true, audio: string, bytes: number, sec: number, wave: number[], once: boolean } | { ok: false, status: number, error: string }}
 */
export function checkVoiceUpload(input) {
  const audio = typeof input?.audio === 'string' ? input.audio : ''
  if (!audio || audio.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) return { ok: false, status: 400, error: CHAT_VOICE_BAD_RU }
  const bytes = base64Bytes(audio)
  if (bytes < MIN_BYTES) return { ok: false, status: 400, error: CHAT_VOICE_SHORT_RU }
  if (bytes > CHAT_VOICE_MAX_BYTES) return { ok: false, status: 413, error: CHAT_VOICE_BAD_RU }
  const sec = Math.round(Number(input?.sec))
  if (!Number.isFinite(sec) || sec < CHAT_VOICE_MIN_SEC) return { ok: false, status: 400, error: CHAT_VOICE_SHORT_RU }
  if (sec > CHAT_VOICE_MAX_SEC) return { ok: false, status: 413, error: CHAT_VOICE_BAD_RU }
  const wave = normalizeVoiceWave(input?.wave)
  if (!wave) return { ok: false, status: 400, error: CHAT_VOICE_BAD_RU }
  return { ok: true, audio, bytes, sec, wave, once: input?.once === true }
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
