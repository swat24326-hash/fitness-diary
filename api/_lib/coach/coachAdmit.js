/**
 * Последний шаг входа телефона — общий для пароля и QR: учётка тренера, решение по телефону
 * (новый ждёт «Разрешить»), выдача сессии.
 */
import { sendJson } from '../adminSupabase.js'
import { deviceLabelFromHeaders, gateCoachDevice } from '../deviceBindingGate.js'
import { COACH_BLOCKED_RU, COACH_ONLY_TRAINER_RU, buildCoachSession, isCoachRole } from './coachAuthCore.js'

/** Подпись для админа в «Устройствах тренеров». */
export function coachDeviceLabel(headers) {
  return `Телефон тренера · ${deviceLabelFromHeaders(headers)}`
}

/**
 * @param {{ req: object, res: object, user: object, deviceId: string, beforeSession?: () => Promise<boolean> }} p
 *   beforeSession — false: вход не выдаём (например, QR уже погашен), ответ 401 отправлен вызывающим
 */
export async function admitCoachPhone({ req, res, user, deviceId, beforeSession }, { secret, store, deviceDeps }) {
  if (user.is_active === false) {
    sendJson(res, 403, { error: COACH_BLOCKED_RU })
    return
  }
  if (!isCoachRole(user.role)) {
    sendJson(res, 403, { error: COACH_ONLY_TRAINER_RU })
    return
  }
  const userId = String(user.id)
  const gate = await gateCoachDevice({ userId, deviceId, label: coachDeviceLabel(req.headers) }, deviceDeps)
  if (!gate.allow) {
    sendJson(res, gate.code === 'busy' ? 503 : 403, { error: gate.error, code: gate.code })
    return
  }
  if (beforeSession && !(await beforeSession())) return
  const sid = await store.createSession(userId, deviceId)
  sendJson(res, 200, {
    session: buildCoachSession({ userId, sid, deviceId }, secret),
    user: { name: String(user.name ?? '') },
  })
}
