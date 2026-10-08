/**
 * admin-data?action=inbox — рассылки во «Входящие» клиентов или сотрудников. Только админ (любые клубы) и управляющий (свой).
 * GET  view=list | detail&id= | audience&club_ids=a,b&halls=pz,tz | audience&audience=staff&club_ids=a&roles=trainer,sales
 * POST { op: 'send', draft } | { op: 'close', id }
 */
import { clubOpsAsOfIso } from '../adminData/loyaltyAccountQuery.js'
import { sendJson } from '../adminSupabase.js'
import {
  inboxExpiresAtIso,
  isInboxCampaignOpen,
  isInboxUuid,
  normalizeInboxCampaignDraft,
  normalizeInboxClubIds,
  normalizeInboxHalls,
  normalizeInboxStaffRoles,
} from '../../../src/lib/inbox/inboxCampaignCore.js'
import { inboxCampaignStats, summarizeInboxResults } from '../../../src/lib/inbox/inboxAnswersCore.js'
import {
  INBOX_NO_ACCESS_RU,
  canCloseInboxCampaign,
  canViewInboxCampaign,
  inboxDeliveryClubFilter,
  resolveInboxClubScope,
} from '../../../src/lib/inbox/inboxAudienceCore.js'
import { runWithConcurrency } from '../batchCore.js'
import { inboxPushBlocker, sendInboxPush } from './inboxPushJob.js'
import {
  countCampaignStats,
  insertInboxCampaign,
  insertInboxDeliveries,
  listInboxCampaigns,
  loadCampaignDeliveries,
  loadClubNames,
  loadInboxAudience,
  loadInboxCampaign,
  loadInboxStaffAudience,
  rows,
} from './inboxStore.js'

const NOT_FOUND_RU = 'Рассылка не найдена'
const LIST_STATS_PARALLEL = 3

function splitParam(raw) {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function campaignView(c, stats) {
  return {
    id: c.id,
    kind: c.kind,
    audience: c.audience ?? 'clients',
    staff_roles: c.staff_roles ?? [],
    title: c.title,
    body: c.body,
    questions: c.questions ?? [],
    reward_points: c.reward_points,
    club_ids: c.club_ids ?? [],
    halls: c.halls ?? [],
    trigger: c.trigger ?? null,
    created_at: c.created_at,
    expires_at: c.expires_at,
    closed_at: c.closed_at,
    open: isInboxCampaignOpen(c),
    push_status: c.push_status ?? null,
    stats,
  }
}

async function handleList(ctx, res) {
  const own = inboxDeliveryClubFilter(ctx)
  const db = ctx.supabaseAdmin
  const [campaigns, clubs] = await Promise.all([listInboxCampaigns(db, own), loadClubNames(db, own ? [own] : null)])
  const statsById = new Map()
  await runWithConcurrency(campaigns, LIST_STATS_PARALLEL, async (c) => {
    statsById.set(String(c.id), await countCampaignStats(db, c.id, own))
  })
  sendJson(res, 200, {
    campaigns: campaigns.map((c) => campaignView(c, statsById.get(String(c.id)))),
    clubs: clubs.map((c) => ({ id: c.id, name: String(c.name ?? '') })),
    push_blocker: inboxPushBlocker(),
  })
}

async function handleDetail(ctx, req, res) {
  const id = String(req.query?.id ?? '').trim()
  const db = ctx.supabaseAdmin
  const campaign = isInboxUuid(id) ? await loadInboxCampaign(db, id) : null
  if (!campaign || !canViewInboxCampaign(ctx, campaign)) {
    sendJson(res, 404, { error: NOT_FOUND_RU })
    return
  }
  const deliveries = await loadCampaignDeliveries(
    db,
    [id],
    inboxDeliveryClubFilter(ctx),
    campaign.audience === 'staff'
      ? 'user_id, club_id, read_at, answered_at, answers, reward_points'
      : 'client_id, club_id, read_at, answered_at, answers, reward_points',
  )
  const ownerOf = (d) => String(d.user_id ?? d.client_id ?? '')
  const answeredIds = deliveries.filter((d) => d.answered_at).map(ownerOf)
  const nameTable = campaign.audience === 'staff' ? 'users' : 'clients'
  const names = answeredIds.length ? await rows(db.from(nameTable).select('id, name').in('id', answeredIds)) : []
  const nameOf = new Map(names.map((c) => [String(c.id), String(c.name ?? '')]))
  const withNames = deliveries.map((d) => ({ ...d, client_name: nameOf.get(ownerOf(d)) || '' }))
  sendJson(res, 200, {
    campaign: campaignView(campaign, inboxCampaignStats(deliveries)),
    results: campaign.kind === 'survey' ? summarizeInboxResults(campaign.questions ?? [], withNames) : [],
    respondents: withNames
      .filter((d) => d.answered_at)
      .sort((a, b) => String(b.answered_at).localeCompare(String(a.answered_at)))
      .map((d) => ({ client_name: d.client_name, answered_at: d.answered_at, reward_points: d.reward_points })),
    can_close: canCloseInboxCampaign(ctx, campaign) && !campaign.closed_at,
  })
}

/** Получатели: сотрудники по ролям (без отправителя) или клиенты со входом в приложение. */
function loadRecipients(ctx, { audience, clubIds, halls, staffRoles }) {
  if (audience === 'staff') {
    return loadInboxStaffAudience(ctx.supabaseAdmin, { clubIds, roles: staffRoles, excludeUserId: ctx.user?.id })
  }
  return loadInboxAudience(ctx.supabaseAdmin, { clubIds, halls, asOf: clubOpsAsOfIso() })
}

async function handleAudience(ctx, req, res) {
  const scope = resolveInboxClubScope(ctx, normalizeInboxClubIds(splitParam(req.query?.club_ids)))
  if (!scope.ok) {
    sendJson(res, scope.status, { error: scope.error })
    return
  }
  if (!scope.clubIds.length) {
    sendJson(res, 200, { matched: 0, recipients: 0 })
    return
  }
  const audience = await loadRecipients(ctx, {
    audience: req.query?.audience === 'staff' ? 'staff' : 'clients',
    clubIds: scope.clubIds,
    halls: normalizeInboxHalls(splitParam(req.query?.halls)),
    staffRoles: normalizeInboxStaffRoles(splitParam(req.query?.roles)),
  })
  sendJson(res, 200, { matched: audience.matched, recipients: audience.recipients.length })
}

export async function handleInboxAdminGet(ctx, req, res) {
  if (!ctx.isAdmin && !ctx.isSupervisor) {
    sendJson(res, 403, { error: INBOX_NO_ACCESS_RU })
    return
  }
  const view = String(req.query?.view ?? 'list').trim()
  if (view === 'detail') return handleDetail(ctx, req, res)
  if (view === 'audience') return handleAudience(ctx, req, res)
  return handleList(ctx, res)
}

/** Автоопрос: сейчас никому не уходит — доставку делает inboxMilestoneJob, когда клиент дойдёт до рубежа. */
async function handleSendTriggered(ctx, res, fields, clubIds) {
  const { expires_in_days, ...rest } = fields
  const nowIso = new Date().toISOString()
  const campaign = await insertInboxCampaign(ctx.supabaseAdmin, {
    ...rest,
    club_ids: clubIds,
    created_by: ctx.user?.id ?? null,
    created_at: nowIso,
    expires_at: inboxExpiresAtIso(nowIso, expires_in_days),
    recipients_count: 0,
    push_status: 'trigger',
  })
  sendJson(res, 200, { ok: true, campaign_id: campaign.id, recipients: 0, push: 'trigger' })
}

async function handleSend(ctx, res, draftRaw) {
  const draft = normalizeInboxCampaignDraft({
    ...draftRaw,
    club_ids: ctx.isAdmin ? draftRaw?.club_ids : [ctx.profile?.club_id],
  })
  if (!draft.ok) {
    sendJson(res, 400, { error: draft.error })
    return
  }
  const scope = resolveInboxClubScope(ctx, draft.campaign.club_ids)
  if (!scope.ok) {
    sendJson(res, scope.status, { error: scope.error })
    return
  }
  const db = ctx.supabaseAdmin
  if (draft.campaign.trigger) return handleSendTriggered(ctx, res, draft.campaign, scope.clubIds)
  const staff = draft.campaign.audience === 'staff'
  const { recipients } = await loadRecipients(ctx, {
    audience: draft.campaign.audience,
    clubIds: scope.clubIds,
    halls: draft.campaign.halls,
    staffRoles: draft.campaign.staff_roles,
  })
  if (!recipients.length) {
    sendJson(res, 409, {
      error: staff
        ? 'Некому отправить: в выбранных клубах нет таких сотрудников'
        : 'Некому отправить: у выбранных клиентов нет входа в приложение',
    })
    return
  }
  const blocker = inboxPushBlocker()
  const nowIso = new Date().toISOString()
  const { expires_in_days, trigger: _now, ...fields } = draft.campaign
  const campaign = await insertInboxCampaign(db, {
    ...fields,
    club_ids: scope.clubIds,
    created_by: ctx.user?.id ?? null,
    created_at: nowIso,
    expires_at: inboxExpiresAtIso(nowIso, expires_in_days),
    recipients_count: recipients.length,
    push_status: blocker ?? 'sent',
  })
  await insertInboxDeliveries(db, campaign.id, recipients, campaign.kind === 'survey' ? campaign.reward_points : 0)
  sendJson(res, 200, { ok: true, campaign_id: campaign.id, recipients: recipients.length, push: blocker ?? 'sent' })
  if (!blocker) {
    sendInboxPush(db, campaign, recipients).catch((e) => console.warn('[inbox-push]', e?.message || e))
  }
}

async function handleClose(ctx, res, id) {
  const db = ctx.supabaseAdmin
  const campaign = isInboxUuid(id) ? await loadInboxCampaign(db, String(id).trim()) : null
  if (!campaign || !canViewInboxCampaign(ctx, campaign)) {
    sendJson(res, 404, { error: NOT_FOUND_RU })
    return
  }
  if (!canCloseInboxCampaign(ctx, campaign)) {
    sendJson(res, 403, { error: 'Рассылку на несколько клубов закрывает администратор сети' })
    return
  }
  if (!campaign.closed_at) {
    await rows(db.from('inbox_campaigns').update({ closed_at: new Date().toISOString() }).eq('id', campaign.id).select('id'))
  }
  sendJson(res, 200, { ok: true })
}

export async function handleInboxAdminPost(ctx, res, body) {
  if (!ctx.isAdmin && !ctx.isSupervisor) {
    sendJson(res, 403, { error: INBOX_NO_ACCESS_RU })
    return
  }
  if (body?.op === 'send') return handleSend(ctx, res, body.draft ?? {})
  if (body?.op === 'close') return handleClose(ctx, res, body.id)
  sendJson(res, 400, { error: 'Неизвестное действие' })
}
