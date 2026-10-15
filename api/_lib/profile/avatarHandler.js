/**
 * Фото профиля: своё — get / set / delete (сотрудник: /api/me-profile и /api/coach, клиент: /api/client-me),
 * файл по ссылке — GET /api/me-profile?avatar=<ключ> без входа: ключ случайный, его выдают только списки переписки.
 * Правила ключа и лимиты — src/lib/profile/avatarCore.js. Содержимое файла в лог не пишем — только коды ошибок.
 */
import { randomUUID } from 'node:crypto'
import { sniffAttachMime } from '../../../src/lib/chat/chatAttachCore.js'
import {
  AVATAR_BAD_RU,
  AVATAR_FAILED_RU,
  AVATAR_UNAVAILABLE_RU,
  avatarMimeOf,
  avatarPhotoUrl,
  avatarStorageKey,
  checkAvatarUpload,
  isAvatarKey,
  isAvatarMime,
} from '../../../src/lib/profile/avatarCore.js'
import { activeOwnStatus, checkProfileStatusInput } from '../../../src/lib/profile/profileStatusCore.js'
import { sendJson } from '../adminSupabase.js'
import { chatVoiceStorageMode, deleteVoice, getVoice, putVoice } from '../chat/chatVoiceStorage.js'

/** @typedef {{ table: 'users' | 'clients', side: 'staff' | 'client', id: string }} AvatarOwner */

const TABLE_SIDE = { users: 'staff', clients: 'client' }

async function readRow(db, owner) {
  const { data, error } = await db.from(owner.table).select('avatar_key, status_emoji, status_until').eq('id', owner.id).maybeSingle()
  if (error) throw error
  return data ?? {}
}

async function writeRow(db, owner, patch) {
  const { error } = await db.from(owner.table).update(patch).eq('id', owner.id)
  if (error) throw error
}

async function dropFile(key) {
  if (!isAvatarKey(key)) return
  try {
    await deleteVoice(key)
  } catch (e) {
    console.warn('[avatar]', e?.message || e)
  }
}

const view = (owner, key, row) => ({
  photo: avatarPhotoUrl(key, owner.side, owner.id),
  ready: chatVoiceStorageMode() != null,
  status: activeOwnStatus(row),
})

/**
 * @param {AvatarOwner} owner — только сам человек (id из его входа, не из запроса)
 * @param {'get'|'set'|'delete'|'status'} op — status: { emoji, duration } смайлик рядом с именем (profileStatusCore.js)
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function avatarOp(db, owner, op, input) {
  if (TABLE_SIDE[owner.table] !== owner.side || !owner.id) return { status: 403, body: { error: AVATAR_FAILED_RU } }
  const row = await readRow(db, owner)
  const old = row.avatar_key ?? null
  if (op === 'get') return { status: 200, body: view(owner, old, row) }
  if (op === 'status') {
    const checked = checkProfileStatusInput(input)
    if (!checked.ok) return { status: 400, body: { error: checked.error } }
    const patch = { status_emoji: checked.emoji, status_until: checked.until }
    await writeRow(db, owner, patch)
    return { status: 200, body: view(owner, old, patch) }
  }
  if (op !== 'set' && op !== 'delete') return { status: 400, body: { error: 'Неизвестное действие' } }
  if (op === 'delete') {
    await writeRow(db, owner, { avatar_key: null })
    await dropFile(old)
    return { status: 200, body: view(owner, null, row) }
  }
  if (!chatVoiceStorageMode()) return { status: 503, body: { error: AVATAR_UNAVAILABLE_RU } }
  const checked = checkAvatarUpload(input)
  if (!checked.ok) return { status: checked.status, body: { error: checked.error } }
  const bytes = Buffer.from(checked.data, 'base64')
  const mime = sniffAttachMime(bytes)
  if (!isAvatarMime(mime)) return { status: 400, body: { error: AVATAR_BAD_RU } }
  const key = avatarStorageKey(owner.side, owner.id, randomUUID(), mime)
  try {
    await putVoice(key, bytes, mime)
  } catch (e) {
    console.warn('[avatar]', e?.message || e)
    return { status: 502, body: { error: AVATAR_FAILED_RU } }
  }
  await writeRow(db, owner, { avatar_key: key })
  if (old !== key) await dropFile(old)
  return { status: 200, body: view(owner, key, row) }
}

/** Ответ JSON для op из тела запроса: «avatar-get» → get. */
export async function sendAvatarOp(res, db, owner, action, input) {
  const out = await avatarOp(db, owner, String(action ?? '').replace(/^avatar-/, ''), input)
  sendJson(res, out.status, out.body)
}

export const isAvatarAction = (action) => String(action ?? '').startsWith('avatar-')

/** Картинка по ключу: навсегда в кэш телефона (новое фото — новый ключ), в общие кэши — нет. */
export async function sendAvatarFile(res, key, get = getVoice) {
  if (!isAvatarKey(key)) return sendJson(res, 404, { error: 'Фото не найдено' })
  let bytes
  try {
    bytes = await get(key)
  } catch (e) {
    console.warn('[avatar]', e?.message || e)
    return sendJson(res, 502, { error: 'Не получилось загрузить фото' })
  }
  if (!bytes) return sendJson(res, 404, { error: 'Фото не найдено' })
  res.statusCode = 200
  res.setHeader('Content-Type', avatarMimeOf(key))
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(bytes)
}
