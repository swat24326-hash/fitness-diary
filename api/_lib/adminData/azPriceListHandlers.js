import { sendJson } from '../adminSupabase.js'
import { normalizeAzPriceListDocument } from '../../../src/lib/priceList/azPriceListCore.js'
import { azPriceListDocFromDbRow, azPriceListDocToDbRow } from '../../../src/lib/priceList/azPriceListDbCore.js'
import {
  assertPriceListClubAccess,
  assertPriceListWriteAccess,
} from '../../../src/lib/priceList/priceListAccessCore.js'

const SELECT_COLS =
  'club_id, valid_from, meta, result_directions, class_directions, session_counts, cells, extras, updated_at, updated_by'

/**
 * GET ?action=az-price-list&club_id=
 */
export async function handleAzPriceListGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const access = assertPriceListClubAccess(ctx, clubId)
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error })
    return
  }

  const { data, error } = await ctx.supabaseAdmin
    .from('club_az_price_lists')
    .select(SELECT_COLS)
    .eq('club_id', clubId)
    .maybeSingle()

  if (error) {
    sendJson(res, 500, { error: error.message || 'Не удалось загрузить прайс АЗ' })
    return
  }

  sendJson(res, 200, {
    club_id: clubId,
    price_list: azPriceListDocFromDbRow(data, clubId),
    exists: Boolean(data),
  })
}

/**
 * POST ?action=az-price-list — body: { club_id, price_list }
 */
export async function handleAzPriceListPost(ctx, req, res, body) {
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

  const doc = normalizeAzPriceListDocument(raw, clubId)
  const row = azPriceListDocToDbRow(doc, clubId, ctx.user?.id ?? null)

  const { data, error } = await ctx.supabaseAdmin
    .from('club_az_price_lists')
    .upsert(row, { onConflict: 'club_id' })
    .select(SELECT_COLS)
    .single()

  if (error) {
    sendJson(res, 500, { error: error.message || 'Не удалось сохранить прайс АЗ' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    club_id: clubId,
    price_list: azPriceListDocFromDbRow(data, clubId),
  })
}
