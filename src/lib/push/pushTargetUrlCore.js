/**
 * Куда ведёт push на конкретном устройстве. Отправители пишут адрес планшета; подписка телефона
 * тренера (app 'coach') получает адрес внутри /coach — иначе тап открыл бы полное приложение зала.
 */
export const PUSH_APP_STAFF = 'staff'
export const PUSH_APP_COACH = 'coach'

const STAFF_TRAINER_CHAT = /^\/messages\/chat\/([0-9a-f-]{36})\/trainer(?:[/?#]|$)/i

export function coachPushUrl(url) {
  const chat = STAFF_TRAINER_CHAT.exec(String(url ?? ''))
  return chat ? `/coach/chat/${chat[1].toLowerCase()}` : '/coach'
}

export function pushUrlForApp(url, app) {
  return app === PUSH_APP_COACH ? coachPushUrl(url) : url
}
