/**
 * Звук голосовых и вложения (фото, PDF — voice/att/): бакет Object Storage CHAT_VOICE_BUCKET, префикс voice/ удаляет правило бакета через сутки.
 * Стикеры (chat-sticker/) и фото профиля (avatar/) правило не трогает.
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

/**
 * Кусок файла для Range (сторис-видео).
 * @param {string} key
 * @param {{ start: number, end?: number | null } | null} range null — целиком; end null — с start до конца
 * @returns {Promise<{ bytes: Buffer, size: number, start: number, end: number } | null>}
 */
export async function getVoiceSlice(key, range) {
  if (chatVoiceStorageMode() === 'memory') {
    const all = memory.get(key)
    if (!all) return null
    const size = all.length
    if (!range) return { bytes: Buffer.from(all), size, start: 0, end: size - 1 }
    const start = Math.max(0, Math.floor(range.start))
    const end =
      range.end == null || !Number.isFinite(range.end)
        ? size - 1
        : Math.min(size - 1, Math.floor(range.end))
    if (start > end || start >= size) return null
    return { bytes: Buffer.from(all.subarray(start, end + 1)), size, start, end }
  }
  const headers = { 'X-YaCloud-SubjectToken': await metadataIamToken() }
  if (range) {
    const start = Math.max(0, Math.floor(range.start))
    headers.Range =
      range.end == null || !Number.isFinite(range.end)
        ? `bytes=${start}-`
        : `bytes=${start}-${Math.floor(range.end)}`
  }
  const res = await fetch(objectUrl(key), {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (res.status === 404) return null
  if (!res.ok && res.status !== 206) throw new Error(`voice_get_http_${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const cr = String(res.headers.get('content-range') || '')
  const m = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(cr)
  if (m) {
    return {
      bytes,
      start: Number(m[1]),
      end: Number(m[2]),
      size: Number(m[3]),
    }
  }
  const size = Number(res.headers.get('content-length')) || bytes.length
  if (range) {
    const start = Math.max(0, Math.floor(range.start))
    return { bytes, size: Math.max(size, start + bytes.length), start, end: start + bytes.length - 1 }
  }
  return { bytes, size, start: 0, end: size - 1 }
}

/** Удалить файл (старое фото профиля); уже нет — не ошибка. */
export async function deleteVoice(key) {
  if (chatVoiceStorageMode() === 'memory') {
    memory.delete(key)
    return
  }
  const res = await fetch(objectUrl(key), {
    method: 'DELETE',
    headers: { 'X-YaCloud-SubjectToken': await metadataIamToken() },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok && res.status !== 404) throw new Error(`voice_delete_http_${res.status}`)
}
