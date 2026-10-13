/**
 * Голосовой ввод в переписке, как в Cursor: сказал → текст в поле, человек правит и отправляет сам.
 * Звук — 16 кГц, 16 бит, моно (так его принимает SpeechKit); без React и без браузера — проверяется verify.
 */

export const CHAT_DICTATION_RATE = 16000
/** SpeechKit берёт до 30 с; запас на округления и задержку остановки. */
export const CHAT_DICTATION_MAX_SEC = 25
export const CHAT_DICTATION_MIN_SEC = 0.5
export const CHAT_DICTATION_MAX_BYTES = CHAT_DICTATION_RATE * 2 * (CHAT_DICTATION_MAX_SEC + 1)
const MIN_BYTES = Math.floor(CHAT_DICTATION_RATE * 2 * CHAT_DICTATION_MIN_SEC)
/** Столбиков «волны» на экране записи. */
export const CHAT_DICTATION_BARS = 28

export const CHAT_DICTATION_DENIED_RU = 'Нет доступа к микрофону — разрешите его в настройках браузера'
export const CHAT_DICTATION_NO_MIC_RU = 'Микрофон не найден'
export const CHAT_DICTATION_EMPTY_RU = 'Не расслышал — попробуйте ещё раз'
export const CHAT_DICTATION_SHORT_RU = 'Слишком коротко — скажите ещё раз'
export const CHAT_DICTATION_OFFLINE_RU = 'Нет сети — голосовой ввод недоступен'
export const CHAT_DICTATION_BUSY_RU = 'Слишком часто — подождите минуту'
export const CHAT_DICTATION_UNAVAILABLE_RU = 'Голосовой ввод пока недоступен'
export const CHAT_DICTATION_FAILED_RU = 'Не получилось распознать — попробуйте ещё раз'

/** Частота микрофона (обычно 44,1 / 48 кГц) → 16 кГц: среднее по окну, без «звона» от простого прореживания. */
export function downsamplePcm(input, inRate, outRate = CHAT_DICTATION_RATE) {
  if (!input?.length || !(inRate > 0)) return new Float32Array(0)
  if (inRate <= outRate) return Float32Array.from(input)
  const ratio = inRate / outRate
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i += 1) {
    const from = Math.floor(i * ratio)
    const to = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = from; j < to; j += 1) sum += input[j]
    out[i] = to > from ? sum / (to - from) : 0
  }
  return out
}

/** -1…1 → 16 бит со знаком, младший байт первым (LINEAR16_PCM). */
export function pcm16Bytes(samples) {
  const out = new Uint8Array(samples.length * 2)
  const view = new DataView(out.buffer)
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true)
  }
  return out
}

/** Громкость куска 0…1 для «волны»: корень из RMS — тихая речь тоже видна. */
export function chatDictationLevel(samples) {
  if (!samples?.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i]
  return Math.min(1, Math.sqrt(Math.sqrt(sum / samples.length)) * 1.6)
}

/** Новый столбик справа, старые уезжают влево. */
export function pushDictationLevel(levels, level, max = CHAT_DICTATION_BARS) {
  return [...levels, level].slice(-max)
}

/** 7 → «0:07». */
export function formatDictationTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const SENTENCE_END = /[.!?…]\s*$/
const MID_SENTENCE = /[\p{L}\p{N},;:—–-]\s*$/u

/**
 * Распознанное — в поле на место курсора (выделенное заменяем), как вставка в Cursor.
 * Пробел до и после, где нужно; посреди фразы «Резинку» → «резинку» (аббревиатуры вроде «ПЗ» не трогаем).
 * @returns {{ text: string, caret: number, cut: boolean }}
 */
export function insertDictation(draft, start, end, spoken, max = Infinity) {
  const value = String(draft ?? '')
  const from = Number.isInteger(start) ? Math.max(0, Math.min(start, value.length)) : value.length
  const to = Number.isInteger(end) ? Math.max(from, Math.min(end, value.length)) : from
  let piece = String(spoken ?? '').replace(/\s+/g, ' ').trim()
  if (!piece) return { text: value, caret: to, cut: false }
  const before = value.slice(0, from)
  const after = value.slice(to)
  if (MID_SENTENCE.test(before) && !SENTENCE_END.test(before) && /^\p{Lu}\p{Ll}/u.test(piece)) {
    piece = piece[0].toLowerCase() + piece.slice(1)
  }
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const tail = after && !/^[\s.,!?…;:)]/.test(after) ? ' ' : ''
  const room = max - before.length - after.length - lead.length - tail.length
  const cut = piece.length > room
  if (cut) piece = room > 0 ? piece.slice(0, room).trimEnd() : ''
  if (!piece) return { text: value, caret: to, cut }
  const head = `${before}${lead}${piece}${tail}`
  return { text: `${head}${after}`, caret: head.length, cut }
}

/**
 * Звук от телефона (base64 PCM) — до того, как платить SpeechKit: строка, не пусто, не длиннее лимита.
 * @returns {{ ok: true, bytes: number } | { ok: false, status: number, error: string }}
 */
export function checkDictationAudio(raw) {
  const s = typeof raw === 'string' ? raw : ''
  if (!s || s.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return { ok: false, status: 400, error: CHAT_DICTATION_FAILED_RU }
  const bytes = (s.length / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0)
  if (bytes % 2) return { ok: false, status: 400, error: CHAT_DICTATION_FAILED_RU }
  if (bytes < MIN_BYTES) return { ok: false, status: 400, error: CHAT_DICTATION_SHORT_RU }
  if (bytes > CHAT_DICTATION_MAX_BYTES) return { ok: false, status: 413, error: CHAT_DICTATION_FAILED_RU }
  return { ok: true, bytes }
}
