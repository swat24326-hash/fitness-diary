/**
 * Голос → текст для поля ввода переписки (клиент, сотрудник, телефон тренера). Сообщение не отправляет:
 * текст возвращается в поле, человек правит и шлёт сам. Звук не храним, текст не пишем в логи.
 */
import {
  CHAT_DICTATION_BUSY_RU,
  CHAT_DICTATION_EMPTY_RU,
  CHAT_DICTATION_FAILED_RU,
  CHAT_DICTATION_RATE,
  CHAT_DICTATION_UNAVAILABLE_RU,
  checkDictationAudio,
} from '../../../src/lib/chat/chatDictationCore.js'
import { resolveIskraLlmConfig } from '../iskraLlmCore.js'
import { recognizeYandexStt } from '../yandexSttClient.js'
import { createChatDictateLimiter } from './chatDictateLimitCore.js'

const limiter = createChatDictateLimiter()

/**
 * @param {string} who ключ лимита: 'c:<client id>' | 'u:<user id>'
 * @param {unknown} audio base64 PCM 16 кГц
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function dictateChatAudio(who, audio, recognize = recognizeYandexStt) {
  const checked = checkDictationAudio(audio)
  if (!checked.ok) return { status: checked.status, body: { error: checked.error } }
  const cfg = resolveIskraLlmConfig(process.env)
  if (cfg.provider !== 'yandex') return { status: 503, body: { error: CHAT_DICTATION_UNAVAILABLE_RU } }
  if (!limiter.take(who)) return { status: 429, body: { error: CHAT_DICTATION_BUSY_RU } }
  const out = await recognize(cfg, audio, CHAT_DICTATION_RATE)
  if (!out.ok) {
    console.warn('[chat-dictate]', out.error)
    const denied = /http_40[13]$/.test(out.error)
    return { status: denied ? 503 : 502, body: { error: denied ? CHAT_DICTATION_UNAVAILABLE_RU : CHAT_DICTATION_FAILED_RU } }
  }
  if (!out.text) return { status: 422, body: { error: CHAT_DICTATION_EMPTY_RU } }
  return { status: 200, body: { text: out.text } }
}
