import { sendJson } from '../adminSupabase.js'
import { bearerFromHeaders } from '../clientPortal/clientAuthCore.js'
import { decideCoachDevice } from '../deviceBindingCore.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import {
  COACH_BLOCKED_RU,
  COACH_ONLY_TRAINER_RU,
  COACH_SESSION_RU,
  COACH_TOKEN_TYP,
  coachAccessDenial,
  coachSecret,
  readCoachToken,
} from './coachAuthCore.js'
import { coachStore } from './coachStore.js'

/** Любой отказ пропуска — 401: телефон выходит на экран входа. 403 остаётся за доступом к конкретным данным. */
const DENIAL_RU = { blocked: COACH_BLOCKED_RU, role: COACH_ONLY_TRAINER_RU, session: COACH_SESSION_RU }

/**
 * Только пропуск телефона (typ 'coach'). Учётку, сессию и разрешение телефона сверяем на каждый запрос:
 * «Отозвать» в устройствах, блок и смена пароля действуют сразу, а не через час.
 * Контекст совместим с requireAuthUser в роли тренера — общие обработчики (переписка) работают без копий.
 * @returns {Promise<object | null>}
 */
export async function requireCoachUser(req, res, store = coachStore) {
  const secret = coachSecret()
  if (!secret) {
    sendJson(res, 503, { error: 'Вход с телефона не настроен на сервере' })
    return null
  }
  const tok = readCoachToken(bearerFromHeaders(req.headers), COACH_TOKEN_TYP, secret)
  if (!tok) {
    sendJson(res, 401, { error: COACH_SESSION_RU })
    return null
  }
  const [user, session, devices] = await Promise.all([
    store.loadUser(tok.userId),
    store.loadSession(tok.sid),
    store.devices.listForUser(tok.userId),
  ])
  if (devices.error) {
    sendJson(res, 503, { error: 'Сервер занят — повторите через минуту' })
    return null
  }
  const denial =
    coachAccessDenial({ user, session, userId: tok.userId, deviceId: tok.deviceId }) ??
    (decideCoachDevice({ deviceId: tok.deviceId, devices: devices.rows }).allow ? null : 'session')
  if (denial) {
    sendJson(res, 401, { error: DENIAL_RU[denial] })
    return null
  }
  return {
    supabaseAdmin: store.db ?? createServiceDataClient(),
    user: { id: tok.userId, email: String(user.email ?? '') },
    profile: user,
    roleNorm: 'trainer',
    isAdmin: false,
    isTrainer: true,
    isSalesManager: false,
    isSupervisor: false,
    sid: tok.sid,
    deviceId: tok.deviceId,
  }
}
