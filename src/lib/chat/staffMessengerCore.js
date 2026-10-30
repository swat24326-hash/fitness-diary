/**
 * «Сообщения клуба» сотрудника (тренер, менеджер, управляющий) как Telegram на планшете: слева папки и список,
 * справа открытый диалог или рассылка. Состояние — в адресе: ?folder=…&dm=… | group=клуб | chat=клиент:вид | item=…
 */
import { CHAT_FOLDER_CLIENTS, CHAT_FOLDER_COLLEAGUES, CHAT_FOLDER_COMPLAINTS, chatFolderLabelRu } from './chatContactsCore.js'
import { parseStaffClientChatKey } from './clientAzChatCore.js'

/** Рассылки руководства — последней папкой: сначала переписка. */
export const STAFF_FOLDER_INBOX = 'inbox'
export const STAFF_FOLDER_INBOX_LABEL_RU = 'Рассылки'

/**
 * Папки переписки. У тренера «Клиенты» приходят папкой (все свои); у менеджера и управляющего — список
 * диалогов с клиентами, папку «Клиенты» собираем из него (threads: true — показывать списком диалогов).
 * @param {{ folders: Array<{ id: string, label: string, unread: number, contacts?: object[] }> | null, threads?: object[] | null }} p
 */
export function staffChatFolders({ folders, threads }) {
  const list = (folders ?? []).map((f) => ({ ...f, threads: false }))
  if (list.some((f) => f.id === CHAT_FOLDER_CLIENTS)) return list
  const rows = threads ?? []
  const clients = { id: CHAT_FOLDER_CLIENTS, label: chatFolderLabelRu(CHAT_FOLDER_CLIENTS), unread: rows.filter((t) => t.unread).length, threads: true }
  return [clients, ...list]
}

/**
 * @param {Array<{ id: string, label: string, unread: number }>} chatFolders
 * @param {number} inboxUnread
 */
export function staffMessengerFolders(chatFolders, inboxUnread) {
  const unread = Math.max(0, Number(inboxUnread) || 0)
  return [...(chatFolders ?? []), { id: STAFF_FOLDER_INBOX, label: STAFF_FOLDER_INBOX_LABEL_RU, unread }]
}

/**
 * Какую папку показать. Выбрана в адресе — её. Иначе первую, где есть новое (переписка раньше рассылок),
 * иначе первую — конверт открывает мессенджер, а если новое только в рассылках, человек сразу видит их.
 * @param {{ requested?: string | null, folders: Array<{ id: string, unread: number }> }} p
 */
export function pickStaffFolder({ requested, folders }) {
  const list = folders ?? []
  if (requested && list.some((f) => f.id === requested)) return requested
  return (list.find((f) => Number(f.unread) > 0) ?? list[0])?.id ?? ''
}

/**
 * Что открыто справа.
 * @param {URLSearchParams} params
 * @returns {{ type: 'dm', userId: string } | { type: 'group', clubId: string } | { type: 'chat', clientId: string, kind: string, peerUserId?: string|null } | { type: 'item', id: string } | null}
 */
export function staffOpenFromParams(params) {
  const dm = String(params.get('dm') ?? '').trim()
  if (dm) return { type: 'dm', userId: dm }
  const group = String(params.get('group') ?? '').trim()
  if (group) return { type: 'group', clubId: group }
  const parsed = parseStaffClientChatKey(params.get('chat'))
  if (parsed) {
    return { type: 'chat', clientId: parsed.clientId, kind: parsed.kind, peerUserId: parsed.peerUserId }
  }
  const item = String(params.get('item') ?? '').trim()
  if (item) return { type: 'item', id: item }
  return null
}

/** Папка, в которой лежит открытое (ссылка из уведомления без папки). */
export function staffFolderOfOpen(open) {
  if (!open) return ''
  if (open.type === 'item') return STAFF_FOLDER_INBOX
  if (open.type === 'group') return CHAT_FOLDER_COLLEAGUES
  if (open.type === 'chat') return open.kind === 'supervisor' ? CHAT_FOLDER_COMPLAINTS : CHAT_FOLDER_CLIENTS
  return ''
}

/**
 * Адрес мессенджера: меняем одно — справа открыто что-то одно.
 * @param {URLSearchParams} params
 * @param {{ folder?: string, dm?: string, group?: string, chat?: string, item?: string, close?: boolean }} patch
 */
export function staffMessengerHref(params, patch) {
  const qs = staffMessengerParams(params, patch).toString()
  return qs ? `/messages?${qs}` : '/messages'
}

/** То же, параметрами — для setSearchParams. */
export function staffMessengerParams(params, patch) {
  const next = new URLSearchParams(params)
  next.delete('tab')
  if (patch.folder != null) next.set('folder', patch.folder)
  if (patch.close || patch.dm || patch.group || patch.chat || patch.item) for (const k of ['dm', 'group', 'chat', 'item']) next.delete(k)
  if (patch.dm) next.set('dm', patch.dm)
  if (patch.group) next.set('group', patch.group)
  if (patch.chat) next.set('chat', patch.chat)
  if (patch.item) next.set('item', patch.item)
  return next
}
