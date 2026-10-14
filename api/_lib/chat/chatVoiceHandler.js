/**
 * Голосовые в переписке (клиент, сотрудник, телефон тренера): положить звук, отдать его сутки, расшифровать по «→ Аа».
 * Доступ к диалогу уже проверил вызывающий handler. Звук и текст в лог не пишем — только коды ошибок.
 */
import { randomUUID } from 'node:crypto'
import {
  CHAT_VOICE_BAD_RU,
  CHAT_VOICE_EXPIRED_RU,
  CHAT_VOICE_FAILED_RU,
  CHAT_VOICE_GONE_RU,
  CHAT_VOICE_LOAD_FAILED_RU,
  CHAT_VOICE_ONCE_PLAYED_RU,
  CHAT_VOICE_TEXT_BUSY_RU,
  CHAT_VOICE_TEXT_FAILED_RU,
  CHAT_VOICE_TEXT_UNAVAILABLE_RU,
  CHAT_VOICE_UNAVAILABLE_RU,
  isMp3Header,
  isVoiceExpired,
  isVoiceStorageKey,
  voiceHeardBy,
  voiceOnceRefusal,
  voiceStorageKey,
} from '../../../src/lib/chat/chatVoiceCore.js'
import { resolveIskraLlmConfig } from '../iskraLlmCore.js'
import { pollYandexStt, startYandexStt } from '../yandexSttClient.js'
import { chatVoiceStorageMode, getVoice, putVoice } from './chatVoiceStorage.js'
import { claimOnceVoice, loadVoiceMessage, markVoicePlayed, saveVoiceFields } from './chatVoiceStore.js'
import { createChatVoiceTextLimiter } from './chatVoiceTextLimitCore.js'

const limiter = createChatVoiceTextLimiter()

const fail = (status, error) => ({ ok: false, status, error })

/** Голосовое пришло, а хранилище не настроено — отказ до создания диалога и проверки лимитов. */
export function chatVoiceBlocked(checked, env = process.env) {
  return checked.voice && !chatVoiceStorageMode(env) ? fail(503, CHAT_VOICE_UNAVAILABLE_RU) : null
}

/**
 * Звук (checkVoiceUpload) → хранилище. Повтор той же отправки (тот же msgId) перезапишет тот же файл.
 * @param {{ side: 'client' | 'staff', authorId: string, msgId: string | null }} who
 * @returns {Promise<{ ok: true, voice: { key: string, sec: number, wave: number[], once: boolean } } | { ok: false, status: number, error: string }>}
 */
export async function storeChatVoice(voice, { side, authorId, msgId }, put = putVoice) {
  const bytes = Buffer.from(voice.audio, 'base64')
  if (!isMp3Header(bytes)) return fail(400, CHAT_VOICE_BAD_RU)
  const key = voiceStorageKey(side, authorId, msgId || randomUUID())
  if (!isVoiceStorageKey(key)) return fail(400, CHAT_VOICE_BAD_RU)
  try {
    await put(key, bytes)
  } catch (e) {
    console.warn('[chat-voice]', e?.message || e)
    return fail(502, CHAT_VOICE_FAILED_RU)
  }
  return { ok: true, voice: { key, sec: voice.sec, wave: voice.wave, once: voice.once === true } }
}

/** Звук для пузыря: сутки с отправки, дальше — 410 «удалено». */
export async function voiceAudioAnswer(message, get = getVoice) {
  if (!message?.voice_sec) return { status: 404, body: { error: CHAT_VOICE_GONE_RU } }
  if (!isVoiceStorageKey(message.voice_key) || isVoiceExpired(message.created_at)) return { status: 410, body: { error: CHAT_VOICE_EXPIRED_RU } }
  let bytes
  try {
    bytes = await get(message.voice_key)
  } catch (e) {
    console.warn('[chat-voice]', e?.message || e)
    return { status: 502, body: { error: CHAT_VOICE_LOAD_FAILED_RU } }
  }
  if (!bytes) return { status: 410, body: { error: CHAT_VOICE_EXPIRED_RU } }
  return { status: 200, body: { audio: bytes.toString('base64'), mime: 'audio/mpeg' } }
}

/**
 * «→ Аа»: готовый текст — сразу; иначе запускаем SpeechKit и отвечаем { done: false } — телефон спросит снова через 2 с.
 * Текст пишется один раз и виден обеим сторонам; '' — слов не разобрать.
 * @param {string} who ключ лимита: 'c:<client id>' | 'u:<user id>'
 * @param {{ save: (patch: object, opts?: { claim?: boolean }) => Promise<void>, start?: Function, poll?: Function, get?: Function, env?: object }} deps
 */
export async function voiceTextAnswer(message, who, deps) {
  const { save, start = startYandexStt, poll = pollYandexStt, get = getVoice, env = process.env } = deps
  if (!message?.voice_sec) return { status: 404, body: { error: CHAT_VOICE_GONE_RU } }
  if (typeof message.voice_text === 'string') return { status: 200, body: { done: true, text: message.voice_text } }
  const cfg = resolveIskraLlmConfig(env)
  if (cfg.provider !== 'yandex') return { status: 503, body: { error: CHAT_VOICE_TEXT_UNAVAILABLE_RU } }
  if (message.voice_stt_op) {
    const out = await poll(cfg, message.voice_stt_op)
    if (!out.ok) {
      console.warn('[chat-voice-text]', out.error)
      await save({ voice_stt_op: null })
      return { status: 502, body: { error: CHAT_VOICE_TEXT_FAILED_RU } }
    }
    if (!out.done) return { status: 200, body: { done: false } }
    await save({ voice_text: out.text, voice_stt_op: null })
    return { status: 200, body: { done: true, text: out.text } }
  }
  if (!isVoiceStorageKey(message.voice_key) || isVoiceExpired(message.created_at)) return { status: 410, body: { error: CHAT_VOICE_EXPIRED_RU } }
  if (!limiter.take(who)) return { status: 429, body: { error: CHAT_VOICE_TEXT_BUSY_RU } }
  const bytes = await get(message.voice_key).catch(() => null)
  if (!bytes) return { status: 410, body: { error: CHAT_VOICE_EXPIRED_RU } }
  const out = await start(cfg, bytes.toString('base64'))
  if (!out.ok) {
    console.warn('[chat-voice-text]', out.error)
    const denied = /http_40[13]$/.test(out.error)
    return { status: denied ? 503 : 502, body: { error: denied ? CHAT_VOICE_TEXT_UNAVAILABLE_RU : CHAT_VOICE_TEXT_FAILED_RU } }
  }
  await save({ voice_stt_op: out.id }, { claim: true })
  return { status: 200, body: { done: false } }
}

/**
 * Звук отдан собеседнику автора — «прослушано» (точка гаснет у обоих). Отметка не мешает слушать: сбой — только в лог.
 * @param {{ side?: 'client'|'staff', userId?: string, mark?: boolean }} listener
 */
export async function noteVoicePlayed(message, listener, mark) {
  if (!voiceHeardBy(message, listener)) return false
  try {
    await mark(message.id)
    return true
  } catch (e) {
    console.warn('[chat-voice-played]', e?.message || e)
    return false
  }
}

/**
 * Звук или текст голосового из диалога thread (доступ на чтение уже проверен).
 * @param {'chat_messages' | 'staff_dm_messages'} table
 * @param {'audio' | 'text'} want
 * @param {{ side?: 'client'|'staff', userId?: string, mark?: boolean }} listener кто слушает — для «прослушано»
 */
export async function answerChatVoice(db, table, threadId, messageId, want, who, listener) {
  const message = await loadVoiceMessage(db, table, threadId, messageId)
  const refused = voiceOnceRefusal(message, listener, want)
  if (refused) return { status: refused.status, body: { error: refused.error } }
  if (want === 'text') return voiceTextAnswer(message, who, { save: (patch, opts) => saveVoiceFields(db, table, message.id, patch, opts) })
  const out = await voiceAudioAnswer(message)
  if (out.status !== 200) return out
  if (message.voice_once === true) return onceVoiceAnswer(out, () => claimOnceVoice(db, table, message.id))
  await noteVoicePlayed(message, listener, (id) => markVoicePlayed(db, table, id))
  return out
}

/**
 * Одноразовое: звук уже скачан — забираем право первым (два запроса разом — звук получит один).
 * Ключ файла стираем: больше не отдадим никому; сам файл удалит правило бакета через сутки.
 */
export async function onceVoiceAnswer(out, claim) {
  return (await claim()) ? out : { status: 410, body: { error: CHAT_VOICE_ONCE_PLAYED_RU } }
}
