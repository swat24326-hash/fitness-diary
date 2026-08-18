/**
 * admin-data?action=loyalty-*
 * Правда баланса — src/lib/loyalty/buildLoyaltyAccount. Не копировать алгоритм сюда.
 */

import { sendJson } from '../adminSupabase.js'
import { CLUB_OPS_TIMEZONE, todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { buildLoyaltyAccount } from '../../../src/lib/loyalty/loyaltyAccountCore.js'
import {
  LOYALTY_ERR,
  assertLoyaltyAccountAccess,
  assertLoyaltyJournalAccess,
  assertLoyaltyRedeemAccess,
  assertLoyaltySettingsGet,
  assertLoyaltySettingsPost,
  clipLoyaltyRedeemComment,
  parseLoyaltyGlanceIds,
} from '../../../src/lib/loyalty/loyaltyAccessCore.js'
import { loyaltyRatesFromSettings } from '../../../src/lib/loyalty/loyaltySettingsCore.js'
import { applyLoyaltySettingsPost, loyaltySettingsToDbRow } from '../../../src/lib/loyalty/loyaltySettingsWriteCore.js'
import { decideLoyaltyRedeem } from '../../../src/lib/loyalty/loyaltyRedeemDecisionCore.js'
import {
  clubOpsAsOfIso,
  insertLoyaltyLedgerRow,
  isLoyaltyTableMissing,
  loadLoyaltyAccountBundle,
  loadLoyaltyClientRow,
  loadLoyaltyMembershipTypes,
  loadLoyaltySettingsRow,
  maybeInsertCycleOpen,
  upsertLoyaltySettingsRow,
} from './loyaltyAccountQuery.js'

function migrationRes(res) {
  sendJson(res, 503, {
    error: 'Нужна миграция лояльности (npm run db:migrate:loyalty -- --linked)',
    migration_needed: true,
  })
}

function failQuery(res, error) {
  if (isLoyaltyTableMissing(error)) {
    migrationRes(res)
    return true
  }
  return false
}

async function snapshotForClient(ctx, clientRow, settings, types) {
  const clubId = String(clientRow.club_id ?? '')
  const bundle = await loadLoyaltyAccountBundle(ctx.supabaseAdmin, {
    clientId: clientRow.id,
    clubId,
    clientRow,
    settings,
    types,
  })
  let snapshot = buildLoyaltyAccount(bundle)
  const ledger = await maybeInsertCycleOpen(ctx.supabaseAdmin, {
    clubId,
    clientId: clientRow.id,
    snapshot,
    ledger: bundle.ledger,
    settings,
  })
  if (ledger !== bundle.ledger) {
    snapshot = buildLoyaltyAccount({ ...bundle, ledger })
  }
  return { snapshot, ledger, bundle }
}

export async function handleLoyaltySettingsGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const access = assertLoyaltySettingsGet(ctx, clubId)
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error })
    return
  }
  try {
    const settings = await loadLoyaltySettingsRow(ctx.supabaseAdmin, clubId)
    sendJson(res, 200, { ok: true, club_id: clubId, settings })
  } catch (e) {
    if (failQuery(res, e)) return
    sendJson(res, 500, { error: e?.message ? String(e.message) : 'Не удалось загрузить настройки' })
  }
}

export async function handleLoyaltySettingsPost(ctx, req, res, body) {
  const clubId = String(body?.club_id ?? req.query?.club_id ?? '').trim()
  const access = assertLoyaltySettingsPost(ctx, clubId)
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error })
    return
  }
  const asOf = clubOpsAsOfIso()
  try {
    const current = await loadLoyaltySettingsRow(ctx.supabaseAdmin, clubId)
    const { settings } = applyLoyaltySettingsPost(current, body ?? {}, asOf)
    const row = loyaltySettingsToDbRow(settings, clubId)
    await upsertLoyaltySettingsRow(ctx.supabaseAdmin, row)
    sendJson(res, 200, { ok: true, club_id: clubId, settings })
  } catch (e) {
    if (failQuery(res, e)) return
    sendJson(res, 500, { error: e?.message ? String(e.message) : 'Не удалось сохранить настройки' })
  }
}

export async function handleLoyaltyAccountGet(ctx, req, res) {
  const clientId = String(req.query?.client_id ?? '').trim()
  if (!clientId) {
    sendJson(res, 400, { error: LOYALTY_ERR.needClient })
    return
  }
  try {
    const clientRow = await loadLoyaltyClientRow(ctx.supabaseAdmin, clientId)
    if (!clientRow) {
      sendJson(res, 403, { error: LOYALTY_ERR.noClient })
      return
    }
    const access = assertLoyaltyAccountAccess(ctx, {
      clubId: clientRow.club_id,
      clientTrainerId: clientRow.trainer_id,
    })
    if (!access.ok) {
      sendJson(res, access.status, { error: access.error })
      return
    }
    const clubId = String(clientRow.club_id ?? '')
    const [settings, types] = await Promise.all([
      loadLoyaltySettingsRow(ctx.supabaseAdmin, clubId),
      loadLoyaltyMembershipTypes(ctx.supabaseAdmin, clubId),
    ])
    const { snapshot, ledger } = await snapshotForClient(ctx, clientRow, settings, types)
    sendJson(res, 200, { ok: true, club_id: clubId, client_id: clientId, snapshot, ledger })
  } catch (e) {
    if (failQuery(res, e)) return
    sendJson(res, 500, { error: e?.message ? String(e.message) : 'Не удалось загрузить баллы' })
  }
}

export async function handleLoyaltyGlanceGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const clubAccess = assertLoyaltySettingsGet(ctx, clubId)
  if (!clubAccess.ok) {
    sendJson(res, clubAccess.status, { error: clubAccess.error })
    return
  }
  const parsed = parseLoyaltyGlanceIds(req.query?.ids)
  if (!parsed.ok) {
    sendJson(res, parsed.status, { error: parsed.error })
    return
  }
  try {
    const [settings, types] = await Promise.all([
      loadLoyaltySettingsRow(ctx.supabaseAdmin, clubId),
      loadLoyaltyMembershipTypes(ctx.supabaseAdmin, clubId),
    ])
    const { data: clients, error } = await ctx.supabaseAdmin
      .from('clients')
      .select('id, club_id, trainer_id, archived_at')
      .in('id', parsed.ids)
    if (error) throw error
    const by_id = {}
    for (const row of clients ?? []) {
      if (String(row.club_id ?? '') !== clubId) continue
      const access = assertLoyaltyAccountAccess(ctx, {
        clubId: row.club_id,
        clientTrainerId: row.trainer_id,
      })
      if (!access.ok) continue
      const { snapshot } = await snapshotForClient(ctx, row, settings, types)
      by_id[row.id] = snapshot
    }
    sendJson(res, 200, { ok: true, club_id: clubId, as_of: todayInTimeZoneIso(CLUB_OPS_TIMEZONE), by_id })
  } catch (e) {
    if (failQuery(res, e)) return
    sendJson(res, 500, { error: e?.message ? String(e.message) : 'Не удалось загрузить баллы списка' })
  }
}

export async function handleLoyaltyRedeemPost(ctx, req, res, body) {
  const clientId = String(body?.client_id ?? '').trim()
  if (!clientId) {
    sendJson(res, 400, { error: LOYALTY_ERR.needClient })
    return
  }
  try {
    const clientRow = await loadLoyaltyClientRow(ctx.supabaseAdmin, clientId)
    if (!clientRow) {
      sendJson(res, 403, { error: LOYALTY_ERR.noClient })
      return
    }
    const clubId = String(clientRow.club_id ?? '')
    const access = assertLoyaltyRedeemAccess(ctx, clubId)
    if (!access.ok) {
      sendJson(res, access.status, { error: access.error })
      return
    }
    const [settings, types] = await Promise.all([
      loadLoyaltySettingsRow(ctx.supabaseAdmin, clubId),
      loadLoyaltyMembershipTypes(ctx.supabaseAdmin, clubId),
    ])
    const { snapshot } = await snapshotForClient(ctx, clientRow, settings, types)
    const decided = decideLoyaltyRedeem({ snapshot, expected_points: body?.expected_points })
    if (!decided.ok) {
      sendJson(res, decided.status, { error: decided.error })
      return
    }
    await insertLoyaltyLedgerRow(ctx.supabaseAdmin, {
      club_id: clubId,
      client_id: clientId,
      kind: 'redeem',
      at: new Date().toISOString(),
      points: decided.points,
      comment: clipLoyaltyRedeemComment(body?.comment),
      actor_id: ctx.profile?.id ?? ctx.user?.id ?? null,
      snapshot: loyaltyRatesFromSettings(settings),
      payload: {},
    })
    const after = await snapshotForClient(ctx, clientRow, settings, types)
    sendJson(res, 200, { ok: true, club_id: clubId, client_id: clientId, snapshot: after.snapshot })
  } catch (e) {
    if (failQuery(res, e)) return
    sendJson(res, 500, { error: e?.message ? String(e.message) : 'Не удалось списать баллы' })
  }
}

export async function handleLoyaltyJournalGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const access = assertLoyaltyJournalAccess(ctx, clubId)
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error })
    return
  }
  try {
    const { data, error } = await ctx.supabaseAdmin
      .from('loyalty_ledger')
      .select('id, club_id, client_id, kind, at, points, comment, actor_id, created_at')
      .eq('club_id', clubId)
      .eq('kind', 'redeem')
      .order('at', { ascending: false })
      .limit(200)
    if (error) throw error
    const rows = data ?? []
    const ids = [...new Set(rows.map((r) => String(r.client_id ?? '').trim()).filter(Boolean))]
    let nameById = {}
    if (ids.length) {
      const named = await ctx.supabaseAdmin.from('clients').select('id, name').in('id', ids)
      if (named.error) throw named.error
      nameById = Object.fromEntries((named.data ?? []).map((c) => [String(c.id), String(c.name ?? '').trim()]))
    }
    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      rows: rows.map((r) => ({ ...r, client_name: nameById[String(r.client_id)] || '' })),
    })
  } catch (e) {
    if (failQuery(res, e)) return
    sendJson(res, 500, { error: e?.message ? String(e.message) : 'Не удалось загрузить журнал' })
  }
}
