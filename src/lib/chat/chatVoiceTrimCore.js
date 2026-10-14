/**
 * Обрезка голосового перед отправкой, как в Telegram: края волны тянутся пальцем, лишнее режется по кадрам MP3
 * (без перекодирования — быстро и на слабом телефоне). Без React и браузера — verify-chat-voice-player.mjs.
 */
import { CHAT_VOICE_MIN_SEC, compressVoiceWave } from './chatVoiceCore.js'

const L3_KBPS = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

/** Длина кадра Layer III по заголовку; не кадр — 0. */
function frameLength(b, at) {
  if (at + 4 > b.length || b[at] !== 0xff || (b[at + 1] & 0xe0) !== 0xe0) return 0
  const version = (b[at + 1] >> 3) & 3
  if (version === 1 || ((b[at + 1] >> 1) & 3) !== 1) return 0
  const kbps = L3_KBPS[version === 3 ? 1 : 2][b[at + 2] >> 4]
  const rate = RATES[version]?.[(b[at + 2] >> 2) & 3]
  if (!kbps || !rate) return 0
  const pad = (b[at + 2] >> 1) & 1
  return Math.floor(((version === 3 ? 144 : 72) * kbps * 1000) / rate) + pad
}

/** Начала кадров MP3 (тег ID3 в начале пропускаем). */
export function mp3FrameOffsets(bytes) {
  const out = []
  let at = 0
  if (bytes?.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    at = 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f)
  }
  while (bytes && at < bytes.length) {
    const len = frameLength(bytes, at)
    if (!len) break
    out.push(at)
    at += len
  }
  return out
}

/** Кусок записи [from, to] (доли 0…1) целыми кадрами; не MP3 — null. */
export function trimMp3(bytes, from, to) {
  const offsets = mp3FrameOffsets(bytes)
  if (!offsets.length) return null
  const n = offsets.length
  const first = Math.max(0, Math.min(n - 1, Math.floor(from * n)))
  const last = Math.max(first + 1, Math.min(n, Math.ceil(to * n)))
  return bytes.slice(offsets[first], last < n ? offsets[last] : bytes.length)
}

/** Ручки обрезки: по порядку, в пределах записи, между ними не меньше секунды. */
export function clampVoiceTrim(range, sec) {
  const gap = Math.min(1, CHAT_VOICE_MIN_SEC / Math.max(1, Number(sec) || 1))
  let [a, b] = Array.isArray(range) ? range.map((v) => Math.max(0, Math.min(1, Number(v) || 0))) : [0, 1]
  if (b - a < gap) {
    if (a + gap <= 1) b = a + gap
    else a = b - gap
  }
  return [Math.max(0, a), Math.min(1, b)]
}

export function isVoiceTrimmed(range) {
  return Array.isArray(range) && (range[0] > 0.005 || range[1] < 0.995)
}

export function trimmedVoiceSec(sec, range) {
  return Math.max(CHAT_VOICE_MIN_SEC, Math.round(Number(sec) * (range[1] - range[0])))
}

/**
 * Запись к отправке: { audio (base64 MP3), sec, wave } → только кусок между ручками. Не тянули / не MP3 — как была.
 */
export function trimVoiceResult(result, range) {
  if (!isVoiceTrimmed(range)) return result
  const bin = atob(result.audio)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  const cut = trimMp3(bytes, range[0], range[1])
  if (!cut) return result
  let out = ''
  for (let i = 0; i < cut.length; i += 0x8000) out += String.fromCharCode(...cut.subarray(i, i + 0x8000))
  return { audio: btoa(out), sec: trimmedVoiceSec(result.sec, range), wave: trimVoiceWave(result.wave, range) }
}

/** Волна оставшегося куска — снова 48 столбиков. */
export function trimVoiceWave(wave, range) {
  const n = wave.length
  const from = Math.min(n - 1, Math.floor(range[0] * n))
  const to = Math.max(from + 1, Math.ceil(range[1] * n))
  return compressVoiceWave(wave.slice(from, to).map((v) => v / 100))
}
