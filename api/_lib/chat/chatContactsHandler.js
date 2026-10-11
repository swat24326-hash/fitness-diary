/**
 * Папки «Сообщений»: GET /api/coach?view=contacts и admin-data?action=chat&view=contacts.
 * → { role, folders: [{ id, label, unread, contacts }] }; люди уже в порядке «яркие сверху».
 * «Клиенты» — только у тренера (у менеджера и управляющего клиентская часть — прежний список диалогов).
 */
import { sendJson } from '../adminSupabase.js'
import { CHAT_NO_ACCESS_RU, chatStaffRole } from '../../../src/lib/chat/chatAccessCore.js'
import {
  CHAT_FOLDER_ADMIN,
  CHAT_FOLDER_CLIENTS,
  CHAT_FOLDER_COLLEAGUES,
  buildClientContacts,
  chatFolderLabelRu,
  chatFolderUnread,
  sortChatContacts,
} from '../../../src/lib/chat/chatContactsCore.js'
import { loadTrainerClientContacts } from './chatContactsStore.js'
import { isMissingChatTable } from './chatStore.js'
import { loadStaffDmContacts } from './staffDmHandler.js'

function folder(id, role, contacts) {
  const sorted = sortChatContacts(contacts)
  return { id, label: chatFolderLabelRu(id, role), unread: chatFolderUnread(sorted), contacts: sorted }
}

async function clientsFolder(ctx, role) {
  if (role !== 'trainer') return null
  try {
    const data = await loadTrainerClientContacts(ctx.supabaseAdmin, String(ctx.user.id))
    return folder(CHAT_FOLDER_CLIENTS, role, buildClientContacts(data))
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    return null
  }
}

export async function sendChatContacts(ctx, res) {
  const role = chatStaffRole(ctx)
  if (!role) {
    sendJson(res, 403, { error: CHAT_NO_ACCESS_RU })
    return
  }
  const [clients, staff] = await Promise.all([clientsFolder(ctx, role), loadStaffDmContacts(ctx)])
  const folders = [
    clients,
    staff ? folder(CHAT_FOLDER_COLLEAGUES, role, staff.colleagues) : null,
    staff ? folder(CHAT_FOLDER_ADMIN, role, staff.admin) : null,
  ].filter(Boolean)
  sendJson(res, 200, { role, folders })
}
