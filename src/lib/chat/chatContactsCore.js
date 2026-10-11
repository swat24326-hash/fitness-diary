/**
 * Папки «Сообщений» сотрудника: Клиенты · Коллеги · Администрация.
 * В папке по умолчанию все люди: с приложением — ярко и сверху, без — тускло и ниже. Без React и базы.
 */
import { chatUnreadCount, isChatUnreadFor } from './chatAccessCore.js'

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
 * Сводка диалога для строки контакта (пустая, если переписки ещё нет).
 * @param {object | null | undefined} thread строка chat_threads / staff_dm_threads, приведённая к виду staff
 */
export function threadSummary(thread) {
  if (!thread) return { last_preview: '', last_author: null, last_message_at: null, unread: false, unread_count: 0 }
  return {
    last_preview: String(thread.last_preview ?? ''),
    last_author: thread.last_author ?? null,
    last_message_at: thread.last_message_at ?? null,
    unread: isChatUnreadFor('staff', thread),
    unread_count: chatUnreadCount('staff', thread),
  }
}

/**
 * Клиенты тренера + живые входы в приложение + диалоги «Тренер».
 * Ярко — есть приложение или ждёт ответа (непрочитанное пришло из приложения, даже если вход потом отозвали).
 * @param {{ clients: Array<{ id: string, name?: string }>, liveClientIds: Iterable<string>, threads: object[] }} input
 */
export function buildClientContacts({ clients, liveClientIds, threads }) {
  const live = new Set([...(liveClientIds ?? [])].map(String))
  const byClient = new Map((threads ?? []).map((t) => [String(t.client_id), t]))
  return (clients ?? []).map((c) => {
    const id = String(c.id)
    const summary = threadSummary(byClient.get(id))
    return {
      id,
      name: String(c.name ?? '').trim(),
      has_app: live.has(id) || summary.unread,
      has_thread: byClient.has(id),
      ...summary,
    }
  })
}

/**
 * Папка из уже начатых диалогов (клиент написал сам — значит, приложение у него есть).
 * @param {object[]} threads строки chat_threads
 * @param {Map<string, { name?: string }>} clients по client_id
 */
export function buildThreadContacts(threads, clients) {
  return (threads ?? []).map((t) => {
    const id = String(t.client_id)
    return { id, name: String(clients.get(id)?.name ?? '').trim(), has_app: true, has_thread: true, ...threadSummary(t) }
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

function normalizeQuery(s) {
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
  return (contacts ?? []).filter((c) => normalizeQuery(c.name).includes(q))
}

/** Число на вкладке папки — сколько диалогов ждут ответа. */
export function chatFolderUnread(contacts) {
  return (contacts ?? []).filter((c) => c.unread).length
}
