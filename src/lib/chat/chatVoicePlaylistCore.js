/**
 * Плеер голосовых, как в Telegram: доиграло — само включается следующее голосовое собеседника, пауза запоминает место,
 * выбранная скорость — на все голосовые. Без React и браузера — verify-chat-voice-player.mjs.
 */
import { CHAT_VOICE_SPEEDS } from './chatVoiceCore.js'

/**
 * Следующее после key голосовое собеседника (своё, удалённое и одноразовое пропускаем: его слушают только нажатием); нет — null.
 * @param {{ key: string, mine?: boolean, expired?: boolean, once?: boolean }[]} queue голосовые диалога по порядку ленты
 */
export function nextVoiceInQueue(queue, key) {
  const list = Array.isArray(queue) ? queue : []
  const at = list.findIndex((v) => v.key === key)
  if (at < 0) return null
  return list.slice(at + 1).find((v) => !v.mine && !v.expired && !v.once) ?? null
}

/** Предыдущее голосовое (кнопка «назад» на экране блокировки) — любое, кроме удалённого и одноразового. */
export function prevVoiceInQueue(queue, key) {
  const list = Array.isArray(queue) ? queue : []
  const at = list.findIndex((v) => v.key === key)
  if (at <= 0) return null
  return list.slice(0, at).reverse().find((v) => !v.expired && !v.once) ?? null
}

/** С какого места продолжить: пауза посередине — оттуда, почти доиграло или только начало — с начала. */
export function voiceResumeAt(ratio) {
  const r = Number(ratio)
  return Number.isFinite(r) && r > 0.02 && r < 0.98 ? r : 0
}

/** Скорость из памяти телефона; мусор — 1x. */
export function parseVoiceSpeed(raw) {
  const v = Number(raw)
  return CHAT_VOICE_SPEEDS.includes(v) ? v : 1
}

/** Обрезанная запись: доиграли до правой ручки — стоп. */
export function isPastVoiceRange(time, duration, range) {
  return Array.isArray(range) && duration > 0 && time >= range[1] * duration - 0.05
}
