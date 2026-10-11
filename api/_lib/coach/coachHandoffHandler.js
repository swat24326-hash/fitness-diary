/**
 * Вход значка «Домой» на iPhone: у значка своё хранилище — ни сессии, ни номера телефона из Safari.
 * issue — POST /api/coach { op: 'handoff' } с пропуском телефона: одноразовый вход на 2 часа для этого же телефона.
 * redeem — POST /api/coach-auth { action: 'handoff', token }: вход под номером телефона из приглашения
 * (значок берёт его себе) — телефон уже разрешён, второй раз к админу не идёт.
 */
import { sendJson } from '../adminSupabase.js'
import { hashInviteToken, newInviteToken } from '../clientPortal/clientAuthCore.js'
import { admitCoachPhone } from './coachAdmit.js'
import { COACH_HANDOFF_GONE_RU, COACH_HANDOFF_TTL_MS, COACH_INVITE_KIND_HANDOFF, coachHandoffDenial } from './coachInviteCore.js'

export async function issueCoachHandoff(ctx, res, store, nowMs = Date.now()) {
  const token = newInviteToken()
  const expiresAt = new Date(nowMs + COACH_HANDOFF_TTL_MS).toISOString()
  await store.createInvite({
    userId: String(ctx.user.id),
    tokenHash: hashInviteToken(token),
    expiresAt,
    kind: COACH_INVITE_KIND_HANDOFF,
    deviceId: ctx.deviceId,
  })
  sendJson(res, 200, { token, expires_at: expiresAt })
}

export async function redeemCoachHandoff(req, res, body, env) {
  const { store } = env
  const gone = () => sendJson(res, 401, { error: COACH_HANDOFF_GONE_RU })
  const tokenHash = hashInviteToken(body.token)
  const invite = tokenHash ? await store.loadInviteByHash(tokenHash) : null
  const denial = coachHandoffDenial(invite, Date.now())
  if (denial) {
    if (denial !== 'missing') console.warn('[coach-auth] handoff denied:', denial)
    gone()
    return
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
      deviceId: invite.device_id,
      extra: { device_id: invite.device_id },
      beforeSession: async () => {
        if (await store.markInviteUsed(invite.id)) return true
        gone()
        return false
      },
    },
    env,
  )
}
