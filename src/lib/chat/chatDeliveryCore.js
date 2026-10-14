/**
 * Доставка сообщений переписки (без React и базы): номер сообщения от телефона, граница «прочитано»,
 * кто ставит «прочитано», кому из сотрудников слать push.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Номер сообщения от телефона: повтор с тем же номером — то же сообщение. Не uuid — без защиты от дублей. */
export function normalizeClientMsgId(raw) {
  const id = String(raw ?? '').trim().toLowerCase()
  return UUID.test(id) ? id : null
}

function newUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/**
 * Номер для отправки: повтор того же текста / стикера в том же диалоге после ошибки — тот же номер
 * (сервер мог сохранить, а ответ потерялся); другое сообщение или диалог — новый.
 * @param {{ key: string, sig: string, id: string } | null} prev номер неудачной отправки
 * @param {string} key диалог
 * @param {{ body?: string, sticker?: string, audio?: string, attach?: { data?: string }, video?: { size: number }, sec?: number }} outgoing
 * video — Blob записанного кружка: тот же объект после ошибки — тот же номер
 */
export function nextChatOutgoingId(prev, key, outgoing) {
  const audio = typeof outgoing?.audio === 'string' ? outgoing.audio : ''
  const file = typeof outgoing?.attach?.data === 'string' ? outgoing.attach.data : ''
  if (outgoing?.video) {
    if (prev && prev.key === key && prev.video === outgoing.video) return prev
    return { key, sig: `w:${outgoing.video.size}:${outgoing.sec}`, video: outgoing.video, id: newUuid() }
  }
  const sig = audio
    ? `v:${audio.length}:${audio.slice(-64)}`
    : file
      ? `a:${file.length}:${file.slice(0, 128)}${file.slice(file.length >> 1, (file.length >> 1) + 64)}${file.slice(-64)}:${String(outgoing?.body ?? '')}`
      : outgoing?.sticker
        ? `s:${outgoing.sticker}`
        : `t:${String(outgoing?.body ?? '')}`
  if (prev && prev.key === key && prev.sig === sig) return prev
  return { key, sig, id: newUuid() }
}

export function isUniqueViolation(e) {
  return String(e?.code ?? '') === '23505' || /duplicate key|unique/i.test(String(e?.message ?? ''))
}

/**
 * Граница отметки «прочитано»: диалог помечаем, только если в нём нет сообщений новее показанного.
 * Время из базы точнее миллисекунды, а сервер видит его округлённым — граница на 1 мс позже.
 * @param {string | null | undefined} lastShownAt created_at последнего показанного сообщения
 * @returns {string | null}
 */
export function chatReadCutoff(lastShownAt) {
  const ms = Date.parse(String(lastShownAt ?? ''))
  return Number.isFinite(ms) ? new Date(ms + 1).toISOString() : null
}

/** Главный админ читает чужие диалоги для контроля — его просмотр не гасит непрочитанное у ответственного. */
export function staffMarksChatRead(role) {
  return role !== 'admin'
}

/** Список сотрудника: последние диалоги + все ждущие ответа, без повторов; новые сверху. */
export function mergeChatThreads(...lists) {
  const byId = new Map()
  for (const t of lists.flat()) if (t?.id != null && !byId.has(String(t.id))) byId.set(String(t.id), t)
  return [...byId.values()].sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
}

export const CHAT_SEND_PER_MINUTE = 20
export const CHAT_SEND_LIMIT_RU = 'Слишком много сообщений подряд — подождите минуту'

/** Начало окна подсчёта отправок (ISO). */
export function chatSendWindowStart(nowMs = Date.now()) {
  return new Date(nowMs - 60_000).toISOString()
}

/** Защита от залипшей кнопки и спама: не больше CHAT_SEND_PER_MINUTE сообщений автора в диалоге за минуту. */
export function isChatSendLimited(recentCount) {
  return Number(recentCount) >= CHAT_SEND_PER_MINUTE
}

/**
 * Получатели push по списку id: без автора и без заблокированных учёток.
 * @param {string[]} userIds
 * @param {Array<{ id: string, is_active?: boolean | null }>} users
 * @param {string} [excludeUserId]
 */
export function activeChatRecipientIds(userIds, users, excludeUserId = '') {
  const active = new Set(users.filter((u) => u.is_active !== false).map((u) => String(u.id)))
  const skip = String(excludeUserId ?? '')
  return [...new Set(userIds.map(String))].filter((id) => id !== skip && active.has(id))
}
