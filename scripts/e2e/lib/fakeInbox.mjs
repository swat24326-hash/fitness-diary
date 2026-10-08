/**
 * Подменные «Входящие» для автотестов экрана: admin-data?action=my-inbox (ящик сотрудника)
 * action=inbox (рассылки админа, в т.ч. запуск автоопроса), action=survey-points (баллы за опросы на стойке)
 * и action=loyalty-journal (общий журнал списаний).
 * Ответы собирают те же чистые функции, что и сервер.
 */
import { normalizeInboxAnswers } from '../../../src/lib/inbox/inboxAnswersCore.js'
import { buildClientInboxItem, countInboxAttention } from '../../../src/lib/inbox/inboxClientViewCore.js'
import { inboxStaffRoleOf } from '../../../src/lib/inbox/inboxAudienceCore.js'
import { computeSurveyPoints, decideSurveyPointsRedeem, surveyPointsHistory } from '../../../src/lib/inbox/inboxPointsCore.js'
import { normalizeInboxCampaignDraft } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { mergeLoyaltyJournalSources } from '../../../src/lib/loyalty/loyaltyJournalUiCore.js'

/**
 * @param {{ users: object[], clubs: object[] }} state
 * @param {{ campaigns: object[], deliveries: object[] }} inbox deliveries: { id, campaign_id, user_id, created_at, read_at?, answered_at?, answers? }
 */
export function createFakeInbox(state, inbox) {
  const pairsOf = (userId) =>
    inbox.deliveries
      .filter((d) => d.user_id === userId)
      .map((delivery) => ({ delivery, campaign: inbox.campaigns.find((c) => c.id === delivery.campaign_id) }))

  function myInbox(req, user) {
    const now = new Date().toISOString()
    if (req.method === 'GET') {
      const pairs = pairsOf(user.id)
      return { status: 200, json: { items: pairs.map((p) => buildClientInboxItem(p.delivery, p.campaign, now)), attention: countInboxAttention(pairs, now) } }
    }
    const pair = pairsOf(user.id).find((p) => p.delivery.id === req.body?.id)
    if (!pair) return { status: 404, json: { error: 'Сообщение не найдено' } }
    if (req.body?.op === 'answer') {
      const checked = normalizeInboxAnswers(pair.campaign.questions, req.body.answers)
      if (!checked.ok) return { status: 400, json: { error: checked.error } }
      Object.assign(pair.delivery, { answers: checked.answers, answered_at: now })
    }
    pair.delivery.read_at ??= now
    return { status: 200, json: { item: buildClientInboxItem(pair.delivery, pair.campaign, now, true) } }
  }

  function adminInbox(req) {
    const view = req.searchParams.get('view') || 'list'
    if (view === 'audience') {
      const roles = (req.searchParams.get('roles') || '').split(',').filter(Boolean)
      const n =
        req.searchParams.get('audience') === 'staff'
          ? state.users.filter((u) => roles.includes(inboxStaffRoleOf(u.role))).length
          : 37
      return { status: 200, json: { matched: req.searchParams.get('audience') === 'staff' ? n : 420, recipients: n } }
    }
    return { status: 200, json: { campaigns: [], clubs: state.clubs.map((c) => ({ id: c.id, name: c.name })), push_blocker: null } }
  }

  function surveyPoints(req, user) {
    const clientId = req.method === 'GET' ? req.searchParams.get('client_id') : req.body?.client_id
    const grants = inbox.deliveries.filter((d) => d.client_id === clientId && d.reward_granted_at)
    const redemptions = (inbox.redemptions ??= []).filter((r) => r.client_id === clientId)
    if (req.method === 'POST') {
      const decision = decideSurveyPointsRedeem({
        balance: computeSurveyPoints(grants, redemptions).balance,
        points: req.body?.points,
        expected_balance: req.body?.expected_balance,
      })
      if (!decision.ok) return { status: decision.status, json: { error: decision.error } }
      const row = { client_id: clientId, points: decision.points, comment: String(req.body?.comment ?? ''), created_at: new Date().toISOString() }
      inbox.redemptions.push(row)
      redemptions.push(row)
    }
    const titled = grants.map((g) => ({ ...g, title: inbox.campaigns.find((c) => c.id === g.campaign_id)?.title }))
    return {
      status: 200,
      json: { ...computeSurveyPoints(grants, redemptions), history: surveyPointsHistory(titled, redemptions), can_redeem: user.role === 'admin' },
    }
  }

  function loyaltyJournal(req) {
    const club = req.searchParams.get('club_id')
    const survey = (inbox.redemptions ?? []).map((r, i) => ({ id: `s${i}`, club_id: club, ...r }))
    const nameOf = (id) => state.clients?.find((c) => c.id === id)?.name ?? ''
    const rows = mergeLoyaltyJournalSources([], survey).map((r) => ({ ...r, client_name: nameOf(r.client_id) }))
    return { status: 200, json: { ok: true, club_id: club, rows } }
  }

  function sendCampaign(req) {
    const checked = normalizeInboxCampaignDraft(req.body?.draft ?? {})
    if (!checked.ok) return { status: 400, json: { error: checked.error } }
    const id = `camp-${inbox.campaigns.length + 1}`
    inbox.campaigns.push({ id, ...checked.campaign, created_at: new Date().toISOString() })
    return { status: 200, json: { ok: true, campaign_id: id, recipients: 0, push: checked.campaign.trigger ? 'trigger' : 'sent' } }
  }

  return (req, user) => {
    const action = req.searchParams.get('action')
    if (action === 'inbox' && req.method === 'POST' && req.body?.op === 'send') return sendCampaign(req)
    if (action === 'loyalty-journal') return loyaltyJournal(req)
    if (action === 'my-inbox') return myInbox(req, user)
    if (action === 'inbox') return adminInbox(req)
    if (action === 'survey-points') return surveyPoints(req, user)
    return null
  }
}
