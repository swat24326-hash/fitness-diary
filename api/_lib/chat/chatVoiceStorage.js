/**
 * Звук голосовых и вложения (фото, PDF — voice/att/): бакет Object Storage CHAT_VOICE_BUCKET, префикс voice/ удаляет правило бакета через сутки.
 * Доступ — токен сервисного аккаунта ВМ (как у копий базы, scripts/pg-backup-upload-vm.sh), без статических ключей.
 * CHAT_VOICE_STORAGE=memory — в памяти процесса (локально и в автотестах экрана).
 */
import { metadataIamToken } from '../yandexIamToken.js'

const STORAGE_URL = 'https://storage.yandexcloud.net'
const TIMEOUT_MS = 20_000
/** @type {Map<string, Buffer>} */
const memory = new Map()

/** @returns {'memory' | 'bucket' | null} null — голосовые не настроены */
export function chatVoiceStorageMode(env = process.env) {
  if (env.CHAT_VOICE_STORAGE === 'memory') return 'memory'
  return String(env.CHAT_VOICE_BUCKET ?? '').trim() ? 'bucket' : null
}

function objectUrl(key) {
  const bucket = String(process.env.CHAT_VOICE_BUCKET ?? '').trim()
  return `${STORAGE_URL}/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/** @param {string} key @param {Buffer} bytes @param {string} mime — звук голосового или вложение (фото, PDF) */
export async function putVoice(key, bytes, mime = 'audio/mpeg') {
  if (chatVoiceStorageMode() === 'memory') {
    memory.set(key, Buffer.from(bytes))
    return
  }
  const res = await fetch(objectUrl(key), {
    method: 'PUT',
    headers: { 'X-YaCloud-SubjectToken': await metadataIamToken(), 'Content-Type': mime },
    body: bytes,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`voice_put_http_${res.status}`)
}

/** @returns {Promise<Buffer | null>} null — файла уже нет */
export async function getVoice(key) {
  if (chatVoiceStorageMode() === 'memory') return memory.get(key) ?? null
  const res = await fetch(objectUrl(key), {
    headers: { 'X-YaCloud-SubjectToken': await metadataIamToken() },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`voice_get_http_${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
