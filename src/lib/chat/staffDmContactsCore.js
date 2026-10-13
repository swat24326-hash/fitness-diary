/**
 * Папки «Коллеги» и «Администрация»: сотрудники клуба + признак приложения + сводка личного диалога.
 * Ярко — подключён телефон тренера или есть подписка на уведомления (сообщение до него дойдёт), либо ждёт ответа.
 * club_name — у главного админа (люди всей сети), чтобы различать клубы.
 */
import { CHAT_FOLDER_ADMIN, CHAT_FOLDER_COLLEAGUES, threadSummary } from './chatContactsCore.js'
import { staffDmFolderOf, staffDmRoleOf, staffDmSideOf, staffDmThreadForViewer } from './staffDmAccessCore.js'

/**
 * @param {{ viewerId: string, peers: Array<{ id: string, name?: string, role: string, club_name?: string }>, liveUserIds: Iterable<string>, threads: object[] }} input
 * @returns {{ colleagues: object[], admin: object[] }}
 */
export function buildStaffContacts({ viewerId, peers, liveUserIds, threads }) {
  const live = new Set([...(liveUserIds ?? [])].map(String))
  const byPeer = new Map()
  for (const t of threads ?? []) {
    const side = staffDmSideOf(t, viewerId)
    if (side) byPeer.set(String(side === 'lo' ? t.user_hi : t.user_lo), staffDmThreadForViewer(t, viewerId))
  }
  const out = { [CHAT_FOLDER_COLLEAGUES]: [], [CHAT_FOLDER_ADMIN]: [] }
  for (const p of peers ?? []) {
    const folder = staffDmFolderOf(p.role)
    if (!folder) continue
    const id = String(p.id)
    const summary = threadSummary(byPeer.get(id))
    out[folder].push({
      id,
      name: String(p.name ?? '').trim(),
      ...(p.club_name ? { club_name: String(p.club_name) } : {}),
      role: staffDmRoleOf(p.role),
      has_app: live.has(id) || summary.unread,
      has_thread: byPeer.has(id),
      ...summary,
    })
  }
  return { colleagues: out[CHAT_FOLDER_COLLEAGUES], admin: out[CHAT_FOLDER_ADMIN] }
}
