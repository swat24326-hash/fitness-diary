/**
 * Папки «Сообщений»: GET /api/coach?view=contacts и admin-data?action=chat&view=contacts.
 * → { role, folders: [{ id, label, unread, contacts }] }; люди уже в порядке «яркие сверху».
 * «Клиенты» — только у тренера (у менеджера и управляющего клиентская часть — прежний список диалогов).
 * «Жалобы и предложения» — только у тренера, связанного с управляющим (linkedStaffStore).
 */
import { sendJson } from '../adminSupabase.js'
import { CHAT_NO_ACCESS_RU, canStaffReadChat, chatStaffRole } from '../../../src/lib/chat/chatAccessCore.js'
import {
  CHAT_FOLDER_ADMIN,
  CHAT_FOLDER_CLIENTS,
  CHAT_FOLDER_COLLEAGUES,
  CHAT_FOLDER_COMPLAINTS,
  buildClientContacts,
  buildThreadContacts,
  chatFolderLabelRu,
  chatFolderUnread,
  sortChatContacts,
} from '../../../src/lib/chat/chatContactsCore.js'
import { loadTrainerClientContacts } from './chatContactsStore.js'
import { isMissingChatTable, loadClientsByIds } from './chatStore.js'
import { linkedComplaintThreads, linkedSupervisorCtx } from './linkedStaffStore.js'
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

async function complaintsFolder(ctx, role) {
  if (role !== 'trainer' || !(await linkedSupervisorCtx(ctx))) return null
  try {
    const threads = await linkedComplaintThreads(ctx)
    const clients = new Map((await loadClientsByIds(ctx.supabaseAdmin, threads.map((t) => t.client_id))).map((c) => [String(c.id), c]))
    const readable = threads.filter((t) => canStaffReadChat(t.actor, t.kind, clients.get(String(t.client_id))))
    return folder(CHAT_FOLDER_COMPLAINTS, role, buildThreadContacts(readable, clients))
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
  const [clients, staff, complaints] = await Promise.all([
    clientsFolder(ctx, role),
    loadStaffDmContacts(ctx),
    complaintsFolder(ctx, role),
  ])
  const folders = [
    clients,
    staff ? folder(CHAT_FOLDER_COLLEAGUES, role, staff.colleagues) : null,
    staff ? folder(CHAT_FOLDER_ADMIN, role, staff.admin) : null,
    complaints,
  ].filter(Boolean)
  sendJson(res, 200, { role, folders })
}
