/**
 * Фото профиля, как в Telegram: каждый ставит себе сам (верхняя строка меню → «Мой профиль»).
 * Телефон обрезает квадрат и ужимает в JPEG (avatarPrepare.js), сервер проверяет тип по первым байтам.
 * Ключ файла случайный и новый при каждой смене — ссылка на фото одновременно и пропуск к нему, и метка версии:
 * картинку можно кэшировать навсегда, новое фото придёт по новой ссылке.
 * Без React, браузера и базы — общее для сервера и экрана, проверяется verify-profile-avatar.mjs.
 */

export const AVATAR_SIDE = 384
export const AVATAR_MAX_BYTES = 200_000
const MIN_BYTES = 100

export const AVATAR_BAD_RU = 'Фото не подходит — выберите другое'
export const AVATAR_BIG_RU = 'Фото слишком большое — выберите другое'
export const AVATAR_FAILED_RU = 'Не получилось сохранить фото — попробуйте ещё раз'
export const AVATAR_UNAVAILABLE_RU = 'Фото профиля пока недоступно'
export const AVATAR_OFFLINE_RU = 'Нет интернета — фото можно сменить, когда появится сеть'

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const KEY_RE = /^avatar\/([cu])-([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp)$/

/** @param {'client'|'staff'} side */
export function avatarStorageKey(side, ownerId, fileId, mime) {
  return `avatar/${side === 'client' ? 'c' : 'u'}-${String(ownerId).toLowerCase()}/${String(fileId).toLowerCase()}.${EXT[mime] ?? 'bin'}`
}

export function isAvatarKey(key) {
  return KEY_RE.test(String(key ?? ''))
}

/** Тип файла по ключу (сервер отдаёт картинку с ним). */
export function avatarMimeOf(key) {
  const m = KEY_RE.exec(String(key ?? ''))
  return m ? MIME[m[3]] : null
}

/**
 * Ссылка на фото для экрана; null — фото нет. Ключ чужого человека (строку правили в обход API) не показываем.
 * @param {'client'|'staff'} side
 */
export function avatarPhotoUrl(key, side, ownerId) {
  const m = KEY_RE.exec(String(key ?? ''))
  if (!m || m[1] !== (side === 'client' ? 'c' : 'u') || m[2] !== String(ownerId ?? '').toLowerCase()) return null
  return `/api/me-profile?avatar=${encodeURIComponent(m[0])}`
}

/** Фото из POST: base64 до лимита. Тип по байтам проверит сервер (sniffAttachMime). */
export function checkAvatarUpload(input) {
  const data = typeof input?.data === 'string' ? input.data : ''
  if (!data || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, status: 400, error: AVATAR_BAD_RU }
  const bytes = (data.length / 4) * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
  if (bytes < MIN_BYTES) return { ok: false, status: 400, error: AVATAR_BAD_RU }
  if (bytes > AVATAR_MAX_BYTES) return { ok: false, status: 413, error: AVATAR_BIG_RU }
  return { ok: true, data }
}

export function isAvatarMime(mime) {
  return Boolean(EXT[mime])
}
