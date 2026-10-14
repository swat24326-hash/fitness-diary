/**
 * Куда ведёт push на конкретном устройстве. Отправители пишут адрес планшета; подписка телефона
 * тренера (app 'coach') получает адрес внутри /coach — иначе тап открыл бы полное приложение зала.
 * «Жалобы и предложения» (kind supervisor) — телефон тренера, связанного с управляющим (linkedStaffCore).
 * Чат клуба (/messages?group=<клуб>) — на телефоне тренера всегда чат своего клуба: /coach/group.
 */
export const PUSH_APP_STAFF = 'staff'
export const PUSH_APP_COACH = 'coach'

const STAFF_CLIENT_CHAT = /^\/messages\/chat\/([0-9a-f-]{36})\/(trainer|supervisor)(?:[/?#]|$)/i
const STAFF_DM = /^\/messages\/dm\/([0-9a-f-]{36})(?:[/?#]|$)/i
const STAFF_GROUP = /^\/messages\?group=[0-9a-f-]{36}(?:[&#]|$)/i

export function coachPushUrl(url) {
  if (STAFF_GROUP.test(String(url ?? ''))) return '/coach/group'
  const chat = STAFF_CLIENT_CHAT.exec(String(url ?? ''))
  if (chat) {
    const id = chat[1].toLowerCase()
    return chat[2].toLowerCase() === 'supervisor' ? `/coach/chat/${id}/supervisor` : `/coach/chat/${id}`
  }
  const dm = STAFF_DM.exec(String(url ?? ''))
  return dm ? `/coach/dm/${dm[1].toLowerCase()}` : '/coach'
}

/**
 * «Проверить» уведомления — куда ведёт тестовый push. Админу и управляющему пуши приходят о сообщениях —
 * открываем «Сообщения», тренеру и продажам — входящие Планёрки.
 * @param {{ isAdmin?: boolean, isSupervisor?: boolean, isSalesManager?: boolean }} role
 */
export function staffPushTestUrl({ isAdmin = false, isSupervisor = false, isSalesManager = false } = {}) {
  if (isAdmin || isSupervisor) return '/messages'
  return isSalesManager ? '/sales/club-tasks?inbox=1' : '/trainer?inbox=1'
}

export function pushUrlForApp(url, app) {
  return app === PUSH_APP_COACH ? coachPushUrl(url) : url
}
