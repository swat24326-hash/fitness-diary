/**
 * Обрезка голосового перед отправкой, как в Telegram: края волны тянутся пальцем; телефон шлёт целую запись и
 * [с, по] в секундах — режет сервер (chatVoiceTranscode.js), кодек телефона не трогаем.
 * Без React и браузера — verify-chat-voice-player.mjs.
 */
import { CHAT_VOICE_MIN_SEC, compressVoiceWave } from './chatVoiceCore.js'

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

/** Волна оставшегося куска — снова 48 столбиков. */
export function trimVoiceWave(wave, range) {
  const n = wave.length
  const from = Math.min(n - 1, Math.floor(range[0] * n))
  const to = Math.max(from + 1, Math.ceil(range[1] * n))
  return compressVoiceWave(wave.slice(from, to).map((v) => v / 100))
}

/**
 * Что уходит на сервер вместе с кусками: длительность, волна и обрезка [с, по] в секундах точной длины записи (dur).
 * Не тянули ручки — trim: null, запись целиком.
 * @param {{ sec: number, dur?: number, wave: number[] }} result
 * @returns {{ sec: number, wave: number[], trim: [number, number] | null }}
 */
export function voiceTrimPlan(result, range) {
  if (!isVoiceTrimmed(range)) return { sec: result.sec, wave: result.wave, trim: null }
  const dur = Number(result.dur) > 0 ? Number(result.dur) : Number(result.sec)
  const at = (r) => Math.round(r * dur * 100) / 100
  return { sec: trimmedVoiceSec(result.sec, range), wave: trimVoiceWave(result.wave, range), trim: [at(range[0]), at(range[1])] }
}
