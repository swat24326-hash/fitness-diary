import { sendJson } from '../adminSupabase.js'
import { normalizePriceListDocument } from '../../../src/lib/priceList/priceListCore.js'
import { priceListDocFromDbRow, priceListDocToDbRow } from '../../../src/lib/priceList/priceListDbCore.js'
import {
  assertPriceListClubAccess,
  assertPriceListWriteAccess,
} from '../../../src/lib/priceList/priceListAccessCore.js'
import { parseJsonBody } from './salesHandlers.js'

const SELECT_COLS =
  'club_id, valid_from, meta, sessions, people, tariffs, cells, extras, updated_at, updated_by'

/**
 * GET ?action=price-list&club_id=
 * Админ — любой клуб; менеджер — только свой.
 */
export async function handlePriceListGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const access = assertPriceListClubAccess(ctx, clubId)
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error })
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
 * POST ?action=price-list — админ (любой клуб) или менеджер своего клуба.
 * Body: { club_id, price_list }
 */
export async function handlePriceListPost(ctx, req, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  const access = assertPriceListWriteAccess(ctx, clubId)
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error })
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
