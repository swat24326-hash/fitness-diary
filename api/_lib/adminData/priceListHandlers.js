import { sendJson } from '../adminSupabase.js'
import { normalizePriceListDocument } from '../../../src/lib/priceList/priceListCore.js'
import { priceListDocFromDbRow, priceListDocToDbRow } from '../../../src/lib/priceList/priceListDbCore.js'
import { parseJsonBody } from './salesHandlers.js'

const SELECT_COLS =
  'club_id, valid_from, meta, sessions, people, tariffs, cells, extras, updated_at, updated_by'

/**
 * GET ?action=price-list&club_id=
 * Админ — любой клуб; менеджер — только свой (на будущее).
 */
export async function handlePriceListGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (ctx.isSalesManager && !ctx.isAdmin) {
    const own = String(ctx.profile?.club_id ?? ctx.user?.club_id ?? '').trim()
    if (!own || own !== clubId) {
      sendJson(res, 403, { error: 'Нет доступа к прайсу другого клуба' })
      return
    }
  }
  if (!ctx.isAdmin && !ctx.isSalesManager) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return
  }

  const { data, error } = await ctx.supabaseAdmin
    .from('club_price_lists')
    .select(SELECT_COLS)
    .eq('club_id', clubId)
    .maybeSingle()

  if (error) {
    sendJson(res, 500, { error: error.message || 'Не удалось загрузить прайс' })
    return
  }

  const doc = priceListDocFromDbRow(data, clubId)
  sendJson(res, 200, {
    club_id: clubId,
    price_list: doc,
    exists: Boolean(data),
  })
}

/**
 * POST ?action=price-list — только админ.
 * Body: { club_id, price_list }
 */
export async function handlePriceListPost(ctx, req, res, body) {
  if (!ctx.isAdmin) {
    sendJson(res, 403, { error: 'Прайс может сохранять только администратор' })
    return
  }
  const clubId = String(body?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  const raw = body?.price_list
  if (!raw || typeof raw !== 'object') {
    sendJson(res, 400, { error: 'Укажите price_list' })
    return
  }

  const doc = normalizePriceListDocument(raw, clubId)
  const row = priceListDocToDbRow(doc, clubId, ctx.user?.id ?? null)

  const { data, error } = await ctx.supabaseAdmin
    .from('club_price_lists')
    .upsert(row, { onConflict: 'club_id' })
    .select(SELECT_COLS)
    .single()

  if (error) {
    sendJson(res, 500, { error: error.message || 'Не удалось сохранить прайс' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    club_id: clubId,
    price_list: priceListDocFromDbRow(data, clubId),
  })
}

export { parseJsonBody }
