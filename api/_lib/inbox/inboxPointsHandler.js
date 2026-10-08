/**
 * admin-data?action=survey-points — баллы клиента за опросы на стойке.
 * GET  ?client_id= → { balance, earned, redeemed, history, can_redeem }
 * POST { client_id, points, expected_balance, comment } → то же после списания
 * Клуб берём из строки клиента на сервере, не из запроса.
 */
import { sendJson } from '../adminSupabase.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import {
  SURVEY_POINTS_ERR,
  canRedeemSurveyPoints,
  canViewSurveyPoints,
  clipSurveyPointsComment,
  decideSurveyPointsRedeem,
} from '../../../src/lib/inbox/inboxPointsCore.js'
import { insertSurveyPointsRedemption, loadSurveyPointsAccount } from './inboxPointsStore.js'

async function loadVisibleClient(ctx, res, clientIdRaw) {
  const clientId = String(clientIdRaw ?? '').trim()
  if (!isInboxUuid(clientId)) {
    sendJson(res, 400, { error: 'Не указан клиент' })
    return null
  }
  const { data, error } = await ctx.supabaseAdmin.from('clients').select('id, club_id').eq('id', clientId).maybeSingle()
  if (error) throw error
  if (!data || !canViewSurveyPoints(ctx, data.club_id)) {
    sendJson(res, 403, { error: SURVEY_POINTS_ERR.noAccess })
    return null
  }
  return data
}

async function accountView(ctx, client) {
  const account = await loadSurveyPointsAccount(ctx.supabaseAdmin, client.id)
  return { ...account, can_redeem: canRedeemSurveyPoints(ctx, client.club_id) }
}

export async function handleSurveyPointsGet(ctx, req, res) {
  const client = await loadVisibleClient(ctx, res, req.query?.client_id)
  if (!client) return
  sendJson(res, 200, await accountView(ctx, client))
}

export async function handleSurveyPointsPost(ctx, res, body) {
  const client = await loadVisibleClient(ctx, res, body?.client_id)
  if (!client) return
  if (!canRedeemSurveyPoints(ctx, client.club_id)) {
    sendJson(res, 403, { error: SURVEY_POINTS_ERR.noRedeem })
    return
  }
  const { balance } = await loadSurveyPointsAccount(ctx.supabaseAdmin, client.id)
  const decision = decideSurveyPointsRedeem({ balance, points: body?.points, expected_balance: body?.expected_balance })
  if (!decision.ok) {
    sendJson(res, decision.status, { error: decision.error })
    return
  }
  await insertSurveyPointsRedemption(ctx.supabaseAdmin, {
    client_id: client.id,
    club_id: client.club_id ?? null,
    points: decision.points,
    comment: clipSurveyPointsComment(body?.comment),
    actor_id: ctx.user?.id ?? null,
  })
  sendJson(res, 200, await accountView(ctx, client))
}
