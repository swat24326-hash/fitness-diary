/**
 * Папки «Сообщений» сотрудника: Клиенты · Коллеги · Администрация.
 * В папке по умолчанию все люди: с приложением — ярко и сверху, без — тускло и ниже. Без React и базы.
 */
import { CHAT_KIND_AZ_INSTRUCTOR, chatUnreadCount, isChatUnreadFor } from './chatAccessCore.js'
import { chatUnseenReaction } from './chatReactionCore.js'
import { avatarPhotoUrl } from '../profile/avatarCore.js'
import { profileStatusEmoji } from '../profile/profileStatusCore.js'

export const CHAT_FOLDER_CLIENTS = 'clients'
export const CHAT_FOLDER_COLLEAGUES = 'colleagues'
export const CHAT_FOLDER_ADMIN = 'admin'
/** Только у тренера, связанного с управляющим (linkedStaffCore): обращения клиентов клуба к управляющему. */
export const CHAT_FOLDER_COMPLAINTS = 'complaints'
export const CHAT_FOLDERS = Object.freeze([CHAT_FOLDER_CLIENTS, CHAT_FOLDER_COLLEAGUES, CHAT_FOLDER_ADMIN, CHAT_FOLDER_COMPLAINTS])

/** Вторая папка у тренера — «Коллеги», у менеджера и управляющего — «Тренеры». */
export function chatFolderLabelRu(folder, viewerRole) {
  if (folder === CHAT_FOLDER_CLIENTS) return 'Клиенты'
  if (folder === CHAT_FOLDER_COLLEAGUES) return viewerRole === 'trainer' ? 'Коллеги' : 'Тренеры'
  if (folder === CHAT_FOLDER_ADMIN) return 'Администрация'
  if (folder === CHAT_FOLDER_COMPLAINTS) return 'Жалобы и предложения'
  return ''
}

/**
 * Подпись АЗ в списке инструктора: одно направление — его имя; несколько или пусто — «АЗ».
 * @param {Iterable<string>|null|undefined} directionNames
 */
export function azContactSubtitle(directionNames) {
  const names = [...new Set([...(directionNames ?? [])].map((n) => String(n ?? '').trim()).filter(Boolean))]
  return names.length === 1 ? names[0] : 'АЗ'
}

/**
 * Сводка диалога для строки контакта (пустая, если переписки ещё нет).
 * @param {object | null | undefined} thread строка chat_threads / staff_dm_threads, приведённая к виду staff
 */
export function threadSummary(thread) {
  if (!thread) return { last_preview: '', last_author: null, last_message_at: null, unread: false, unread_count: 0, reaction: null }
  return {
    last_preview: String(thread.last_preview ?? ''),
    last_author: thread.last_author ?? null,
    last_message_at: thread.last_message_at ?? null,
    unread: isChatUnreadFor('staff', thread),
    unread_count: chatUnreadCount('staff', thread),
    reaction: chatUnseenReaction('staff', thread),
  }
}

/**
 * @param {object} c
 * @param {string} id
 * @param {ReturnType<typeof threadSummary>} summary
 * @param {boolean} hasApp
 * @param {boolean} hasThread
 * @param {{ kind: string, rowKey: string, subtitle?: string }} meta
 */
function contactRow(c, id, summary, hasApp, hasThread, meta) {
  return {
    id,
    name: String(c.name ?? '').trim(),
    photo: avatarPhotoUrl(c.avatar_key, 'client', id),
    status: profileStatusEmoji(c, 'client'),
    has_app: hasApp,
    has_thread: hasThread,
    kind: meta.kind,
    rowKey: meta.rowKey,
    subtitle: String(meta.subtitle ?? '').trim(),
    ...summary,
  }
}

/**
 * Клиенты тренера (ПЗ) + клиенты АЗ этого инструктора + живые входы + диалоги.
 * Ярко — есть приложение или ждёт ответа (непрочитанное пришло из приложения, даже если вход потом отозвали).
 * Дубль ПЗ+АЗ у одного человека — две строки (разный rowKey), чтобы непрочитанное не потерялось.
 * @param {{
 *   clients?: Array<{ id: string, name?: string }>,
 *   liveClientIds?: Iterable<string>,
 *   threads?: object[],
 *   azClients?: Array<{ id: string, name?: string }>,
 *   azLiveClientIds?: Iterable<string>,
 *   azThreads?: object[],
 *   azSubtitleByClientId?: Map<string, string> | Record<string, string>,
 * }} input
 */
export function buildClientContacts({
  clients,
  liveClientIds,
  threads,
  azClients,
  azLiveClientIds,
  azThreads,
  azSubtitleByClientId,
} = {}) {
  const live = new Set([...(liveClientIds ?? [])].map(String))
  const byClient = new Map((threads ?? []).map((t) => [String(t.client_id), t]))
  const pz = (clients ?? []).map((c) => {
    const id = String(c.id)
    const summary = threadSummary(byClient.get(id))
    return contactRow(c, id, summary, live.has(id) || summary.unread, byClient.has(id), {
      kind: 'trainer',
      rowKey: id,
    })
  })

  const azLive = new Set([...(azLiveClientIds ?? liveClientIds ?? [])].map(String))
  const azByClient = new Map((azThreads ?? []).map((t) => [String(t.client_id), t]))
  const subtitles =
    azSubtitleByClientId instanceof Map
      ? azSubtitleByClientId
      : new Map(Object.entries(azSubtitleByClientId ?? {}).map(([k, v]) => [String(k), String(v ?? '')]))

  const az = (azClients ?? []).map((c) => {
    const id = String(c.id)
    const summary = threadSummary(azByClient.get(id))
    const subtitle = String(subtitles.get(id) ?? '').trim() || 'АЗ'
    return contactRow(c, id, summary, azLive.has(id) || summary.unread, azByClient.has(id), {
      kind: CHAT_KIND_AZ_INSTRUCTOR,
      rowKey: `${id}:${CHAT_KIND_AZ_INSTRUCTOR}`,
      subtitle,
    })
  })

  return [...pz, ...az]
}

/**
 * Папка из уже начатых диалогов (клиент написал сам — значит, приложение у него есть).
 * @param {object[]} threads строки chat_threads
 * @param {Map<string, { name?: string }>} clients по client_id
 */
export function buildThreadContacts(threads, clients) {
  return (threads ?? []).map((t) => {
    const id = String(t.client_id)
    const c = clients.get(id)
    const kind = String(t.kind ?? 'trainer')
    const peer = String(t.peer_user_id ?? '').trim()
    const rowKey = peer ? `${id}:${kind}:${peer}` : kind === 'trainer' ? id : `${id}:${kind}`
    return {
      id,
      name: String(c?.name ?? '').trim(),
      photo: avatarPhotoUrl(c?.avatar_key, 'client', id),
      status: profileStatusEmoji(c, 'client'),
      has_app: true,
      has_thread: true,
      kind,
      rowKey,
      subtitle: '',
      ...threadSummary(t),
    }
  })
}

const collator = new Intl.Collator('ru', { sensitivity: 'base' })

function byName(a, b) {
  return collator.compare(a.name || '', b.name || '')
}

/**
 * Яркие сверху: непрочитанные → свежее сообщение → имя. Тусклые ниже по алфавиту.
 * @template {{ name: string, has_app: boolean, unread: boolean, last_message_at: string | null }} T
 * @param {T[]} contacts
 * @returns {T[]}
 */
export function sortChatContacts(contacts) {
  const bright = []
  const dim = []
  for (const c of contacts ?? []) (c.has_app ? bright : dim).push(c)
  bright.sort(
    (a, b) =>
      Number(b.unread) - Number(a.unread) ||
      String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')) ||
      byName(a, b),
  )
  dim.sort(byName)
  return [...bright, ...dim]
}

export function normalizeQuery(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Поиск по имени: «анна» найдёт «Тестова Анна», «ё» = «е». Пустой запрос — весь список. */
export function filterChatContacts(contacts, query) {
  const q = normalizeQuery(query)
  if (!q) return contacts ?? []
  return (contacts ?? []).filter((c) =>
    normalizeQuery(`${c.name ?? ''} ${c.club_name ?? ''} ${c.subtitle ?? ''}`).includes(q),
  )
}

/** Число на вкладке папки — сколько диалогов ждут ответа. */
export function chatFolderUnread(contacts) {
  return (contacts ?? []).filter((c) => c.unread).length
}

/** Заголовок строки: имя · направление / клуб. */
export function chatContactTitleRu(c) {
  const name = String(c?.name ?? '').trim() || 'Без имени'
  const tail = String(c?.subtitle ?? '').trim() || String(c?.club_name ?? '').trim()
  return tail ? `${name} · ${tail}` : name
}
