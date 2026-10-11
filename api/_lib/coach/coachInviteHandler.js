/**
 * QR для телефона тренера (через /api/coach-auth):
 * invite — с планшета, Bearer сотрудника, только тренер → { token, expires_at };
 * redeem { token } — с телефона (x-device-id coach-…): закрепляет ссылку за телефоном и дальше как вход по паролю.
 */
import { requireAuthUser, sendJson } from '../adminSupabase.js'
import { isCoachDeviceId } from '../deviceBindingCore.js'
import { deviceIdFromHeaders } from '../deviceBindingGate.js'
import { hashInviteToken, newInviteToken } from '../clientPortal/clientAuthCore.js'
import { admitCoachPhone } from './coachAdmit.js'
import {
  COACH_INVITE_GONE_RU,
  COACH_INVITE_ONLY_TRAINER_RU,
  COACH_INVITE_PAIRED_TTL_MS,
  COACH_INVITE_TTL_MS,
  coachInviteDenial,
} from './coachInviteCore.js'

export async function issueCoachInvite(req, res, { store, auth = requireAuthUser }) {
  const ctx = await auth(req, res)
  if (!ctx) return
  if (!ctx.isTrainer) {
    sendJson(res, 403, { error: COACH_INVITE_ONLY_TRAINER_RU })
    return
  }
  const token = newInviteToken()
  const expiresAt = new Date(Date.now() + COACH_INVITE_TTL_MS).toISOString()
  await store.createInvite({ userId: String(ctx.user.id), tokenHash: hashInviteToken(token), expiresAt })
  sendJson(res, 200, { token, expires_at: expiresAt })
}

export async function redeemCoachInvite(req, res, body, env) {
  const { store } = env
  const deviceId = deviceIdFromHeaders(req.headers)
  if (!isCoachDeviceId(deviceId)) {
    sendJson(res, 400, { error: 'Обновите страницу и отсканируйте QR снова', code: 'device_update' })
    return
  }
  const gone = () => sendJson(res, 401, { error: COACH_INVITE_GONE_RU })
  const tokenHash = hashInviteToken(body.token)
  const invite = tokenHash ? await store.loadInviteByHash(tokenHash) : null
  const denial = coachInviteDenial(invite, deviceId, Date.now())
  if (denial) {
    if (denial !== 'missing') console.warn('[coach-auth] QR denied:', denial)
    gone()
    return
  }
  if (!invite.device_id) {
    const pairedUntil = new Date(Date.now() + COACH_INVITE_PAIRED_TTL_MS).toISOString()
    if (!(await store.bindInvite(invite.id, deviceId, pairedUntil))) {
      gone()
      return
    }
  }
  const user = await store.loadUser(invite.user_id)
  if (!user?.id) {
    gone()
    return
  }
  await admitCoachPhone(
    {
      req,
      res,
      user,
      deviceId,
      beforeSession: async () => {
        if (await store.markInviteUsed(invite.id)) return true
        gone()
        return false
      },
    },
    env,
  )
}
