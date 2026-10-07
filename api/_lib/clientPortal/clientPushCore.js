/**
 * Подписка телефона клиента на push (без БД). Endpoint присылает браузер с улицы, а POST на него
 * потом делает наш сервер — поэтому только известные push-службы, иначе это запрос во внутреннюю сеть ВМ.
 */
import { normalizePushSubscribePayload } from '../../../src/lib/push/trainerPushCore.js'

const PUSH_HOSTS = ['fcm.googleapis.com', 'push.apple.com', 'notify.windows.com', 'push.services.mozilla.com']

export function isAllowedPushEndpoint(raw) {
  let url
  try {
    url = new URL(String(raw ?? ''))
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
}

export const CLIENT_PUSH_BROWSER_RU = 'Этот браузер не поддерживает напоминания. Откройте приложение из значка на главном экране.'

/** @returns {{ ok: true, payload: object } | { ok: false, error: string }} */
export function normalizeClientPushSubscribe(body) {
  const n = normalizePushSubscribePayload(body)
  if (!n.ok) return n
  if (!isAllowedPushEndpoint(n.payload.endpoint)) return { ok: false, error: CLIENT_PUSH_BROWSER_RU }
  return n
}
