/**
 * Расширения дневника: поиск, часто ем, копия, вода, неделя, штрихкод OFF.
 */
import { randomUUID } from 'node:crypto'
import { sendJson } from '../adminSupabase.js'
import { clubOpsAsOfIso } from '../adminData/loyaltyAccountQuery.js'
import {
  mergeFoodDiarySearchHits,
  normalizeFoodBarcode,
  searchBuiltinFoodDiaryCatalog,
  searchClubFoodDiaryRows,
} from '../../../src/lib/client/foodDiaryCatalogCore.js'
import {
  buildCopiedFoodDiaryRows,
  buildFrequentFoods,
  parseFoodDiaryCopyDates,
} from '../../../src/lib/client/foodDiaryHabitsCore.js'
import { parseFoodDiaryWaterMl } from '../../../src/lib/client/foodDiaryWaterCore.js'
import { buildFoodDiaryWeekSeries, foodDiaryWeekRangeEnding } from '../../../src/lib/client/foodDiaryWeekCore.js'
import { parseOpenFoodFactsResponse } from '../../../src/lib/client/foodDiaryOffBarcodeCore.js'
import {
  parseFoodDiaryFromPlanRequest,
  resolveFoodDiaryFromPlanConflict,
} from '../../../src/lib/client/foodDiaryFromPlanCore.js'
import {
  parseFoodDiaryPersonalTargets,
  publicFoodDiaryPersonalTargets,
} from '../../../src/lib/client/foodDiaryPersonalTargetsCore.js'
import {
  dayIso,
  isFoodDiaryMealKey,
  parseFoodDiaryDate,
  publicFoodDiaryEntry,
  sumFoodDiaryDay,
} from '../../../src/lib/client/foodDiaryDayCore.js'

const ENTRY_SELECT =
  'id, client_id, club_id, entry_date, meal_key, name, grams, kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g, sodium_mg, created_at'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function missingSchema(res) {
  sendJson(res, 503, { error: 'Дневник калорий ещё не подключен — обновите клуб' })
}

function isMissingTable(e) {
  return /client_food_diary_entries|client_food_diary_water|client_food_diary_targets|42P01|PGRST205|does not exist/i.test(
    String(e?.message ?? e?.code ?? ''),
  )
}

const TARGETS_SELECT = 'client_id, club_id, kcal, protein_g, fat_g, carbs_g, updated_at'

function dayPayload(entryDate, list) {
  const entries = list.map((r) => publicFoodDiaryEntry(r)).filter(Boolean)
  return { entry_date: entryDate, entries, totals: sumFoodDiaryDay(entries) }
}

async function loadDay(db, clientId, entryDate) {
  return rows(
    db
      .from('client_food_diary_entries')
      .select(ENTRY_SELECT)
      .eq('client_id', clientId)
      .eq('entry_date', entryDate)
      .order('created_at', { ascending: true }),
  )
}

async function loadClubProducts(db, clubId) {
  try {
    return await rows(
      db
        .from('nutrition_products')
        .select('id, label, protein_per100, fat_per100, carbs_per100, piece_grams, is_active, club_id')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .limit(2000),
    )
  } catch {
    return []
  }
}

export async function handleFoodDiarySearch(db, ctx, body, res) {
  const q = String(body?.query ?? body?.q ?? '').trim()
  if (q.length < 1) {
    sendJson(res, 400, { error: 'Введите название продукта' })
    return
  }
  try {
    const clubRows = await loadClubProducts(db, ctx.client.club_id)
    const clubHits = searchClubFoodDiaryRows(clubRows, q, { limit: 16 })
    const builtinHits = searchBuiltinFoodDiaryCatalog(q, { limit: 16 })
    const hits = mergeFoodDiarySearchHits(clubHits, builtinHits, 24)
    sendJson(res, 200, { ok: true, query: q, hits })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

export async function handleFoodDiaryBarcode(db, ctx, body, res) {
  void db
  void ctx
  const code = normalizeFoodBarcode(body?.barcode ?? body?.code)
  if (!code) {
    sendJson(res, 400, { error: 'Штрихкод: 8–14 цифр' })
    return
  }
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'YadroFoodDiary/1.0 (fitness-diary; club-app)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) {
      sendJson(res, 502, { error: 'Каталог штрихкодов временно недоступен' })
      return
    }
    const json = await resp.json()
    const parsed = parseOpenFoodFactsResponse(json, code)
    if (!parsed.ok) {
      sendJson(res, 404, { error: parsed.error })
      return
    }
    sendJson(res, 200, { ok: true, hit: parsed.hit })
  } catch (e) {
    sendJson(res, 502, { error: e?.message || 'Не удалось запросить штрихкод' })
  }
}

export async function handleFoodDiaryFrequent(db, ctx, body, res) {
  const limit = Math.min(20, Math.max(1, Number(body?.limit) || 8))
  const today = clubOpsAsOfIso()
  const from = dayIso(body?.from) || null
  try {
    let q = db
      .from('client_food_diary_entries')
      .select(ENTRY_SELECT)
      .eq('client_id', ctx.clientId)
      .order('created_at', { ascending: false })
      .limit(400)
    if (from && parseFoodDiaryDate(from, today).ok) {
      q = q.gte('entry_date', from)
    }
    const list = await rows(q)
    const frequent = buildFrequentFoods(list, { limit })
    sendJson(res, 200, { ok: true, frequent })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

export async function handleFoodDiaryCopy(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const dates = parseFoodDiaryCopyDates(body?.from_date ?? body?.from, body?.to_date ?? body?.to, today)
  if (!dates.ok) {
    sendJson(res, 400, { error: dates.error })
    return
  }
  const mealKey = body?.meal_key ? String(body.meal_key) : null
  if (mealKey && !isFoodDiaryMealKey(mealKey)) {
    sendJson(res, 400, { error: 'Неверный приём пищи' })
    return
  }
  try {
    const source = await loadDay(db, ctx.clientId, dates.from)
    const built = buildCopiedFoodDiaryRows(source, dates.to, { meal_key: mealKey })
    if (!built.ok) {
      sendJson(res, 400, { error: built.error })
      return
    }
    const now = new Date().toISOString()
    const insertRows = built.rows.map((r) => ({
      id: randomUUID(),
      client_id: ctx.clientId,
      club_id: ctx.client.club_id,
      ...r,
      created_at: now,
    }))
    const { error } = await db.from('client_food_diary_entries').insert(insertRows)
    if (error) throw error
    const list = await loadDay(db, ctx.clientId, dates.to)
    sendJson(res, 200, { ok: true, copied: insertRows.length, ...dayPayload(dates.to, list) })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

export async function handleFoodDiaryWaterGet(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const parsed = parseFoodDiaryDate(body?.entry_date ?? body?.date ?? today, today)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }
  try {
    const list = await rows(
      db
        .from('client_food_diary_water')
        .select('client_id, entry_date, ml, updated_at')
        .eq('client_id', ctx.clientId)
        .eq('entry_date', parsed.date)
        .limit(1),
    )
    const ml = list[0] ? Number(list[0].ml) || 0 : 0
    sendJson(res, 200, { ok: true, entry_date: parsed.date, ml })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

export async function handleFoodDiaryWaterSet(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const parsed = parseFoodDiaryDate(body?.entry_date ?? body?.date ?? today, today)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }
  const water = parseFoodDiaryWaterMl(body?.ml)
  if (!water.ok) {
    sendJson(res, 400, { error: water.error })
    return
  }
  try {
    const now = new Date().toISOString()
    const { error } = await db.from('client_food_diary_water').upsert(
      {
        client_id: ctx.clientId,
        club_id: ctx.client.club_id,
        entry_date: parsed.date,
        ml: water.ml,
        updated_at: now,
      },
      { onConflict: 'client_id,entry_date' },
    )
    if (error) throw error
    sendJson(res, 200, { ok: true, entry_date: parsed.date, ml: water.ml })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

export async function handleFoodDiaryWeek(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const endRaw = body?.end_date ?? body?.to ?? body?.entry_date ?? today
  const range = foodDiaryWeekRangeEnding(endRaw)
  if (!range.ok) {
    sendJson(res, 400, { error: range.error })
    return
  }
  if (range.to > today) {
    sendJson(res, 400, { error: 'Дата не может быть в будущем' })
    return
  }
  try {
    const list = await rows(
      db
        .from('client_food_diary_entries')
        .select(ENTRY_SELECT)
        .eq('client_id', ctx.clientId)
        .gte('entry_date', range.from)
        .lte('entry_date', range.to)
        .order('entry_date', { ascending: true }),
    )
    const series = buildFoodDiaryWeekSeries(list, range.dates)
    sendJson(res, 200, {
      ok: true,
      from: range.from,
      to: range.to,
      days: series.days,
      week_totals: series.weekTotals,
      days_with_food: series.daysWithFood,
      avg_kcal: series.avgKcal,
    })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

/**
 * Приёмы рациона → записи дневника (сервер грузит plan по id; mode add|replace).
 * body: plan_id, entry_date, day_index?, mode?
 */
export async function handleFoodDiaryFromPlan(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const planId = String(body?.plan_id ?? '').trim()
  let planPayload = body?.plan_payload
  try {
    if (planId) {
      const { data: plan, error: planErr } = await db
        .from('client_plans')
        .select('id, client_id, club_id, kind, payload')
        .eq('id', planId)
        .maybeSingle()
      if (planErr) throw planErr
      if (!plan || String(plan.client_id) !== String(ctx.clientId)) {
        sendJson(res, 404, { error: 'Рацион не найден' })
        return
      }
      if (String(plan.kind || '') !== 'nutrition') {
        sendJson(res, 400, { error: 'Это не рацион питания' })
        return
      }
      planPayload = plan.payload
    }

    const parsed = parseFoodDiaryFromPlanRequest(
      { ...body, plan_payload: planPayload },
      today,
    )
    if (!parsed.ok) {
      sendJson(res, 400, { error: parsed.error })
      return
    }
    if (parsed.entry_date > today) {
      sendJson(res, 400, { error: 'Дата не может быть в будущем' })
      return
    }

    const existing = await rows(
      db
        .from('client_food_diary_entries')
        .select(ENTRY_SELECT)
        .eq('client_id', ctx.clientId)
        .eq('entry_date', parsed.entry_date),
    )
    const occupied = [...new Set(existing.map((r) => r.meal_key).filter(isFoodDiaryMealKey))]
    const resolution = resolveFoodDiaryFromPlanConflict(parsed.mode, occupied, parsed.rows)
    if (!resolution.ok) {
      sendJson(res, 400, { error: resolution.error })
      return
    }

    if (resolution.delete_meal_keys?.length) {
      const { error: delErr } = await db
        .from('client_food_diary_entries')
        .delete()
        .eq('client_id', ctx.clientId)
        .eq('entry_date', parsed.entry_date)
        .in('meal_key', resolution.delete_meal_keys)
      if (delErr) throw delErr
    }

    const now = new Date().toISOString()
    const insertRows = (resolution.rows || []).map((r) => ({
      id: randomUUID(),
      client_id: ctx.clientId,
      club_id: ctx.client.club_id,
      entry_date: parsed.entry_date,
      meal_key: r.meal_key,
      name: r.name,
      grams: r.grams,
      kcal: r.kcal,
      protein_g: r.protein_g,
      fat_g: r.fat_g,
      carbs_g: r.carbs_g,
      fiber_g: r.fiber_g ?? 0,
      sugar_g: r.sugar_g ?? 0,
      sodium_mg: r.sodium_mg ?? 0,
      created_at: now,
      updated_at: now,
    }))
    if (insertRows.length) {
      const { error: insErr } = await db.from('client_food_diary_entries').insert(insertRows)
      if (insErr) throw insErr
    }

    const dayRows = await rows(
      db
        .from('client_food_diary_entries')
        .select(ENTRY_SELECT)
        .eq('client_id', ctx.clientId)
        .eq('entry_date', parsed.entry_date)
        .order('created_at', { ascending: true }),
    )
    const list = dayRows.map(publicFoodDiaryEntry)
    sendJson(res, 200, {
      ok: true,
      inserted: insertRows.length,
      mode: parsed.mode,
      entry_date: parsed.entry_date,
      entries: list,
      totals: sumFoodDiaryDay(list),
    })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

/** Свои цели КБЖУ (АЗ/ТЗ; у ПЗ — если рациона нет). */
export async function handleFoodDiaryTargetsGet(db, ctx, _body, res) {
  try {
    const { data, error } = await db
      .from('client_food_diary_targets')
      .select(TARGETS_SELECT)
      .eq('client_id', ctx.clientId)
      .maybeSingle()
    if (error) throw error
    sendJson(res, 200, {
      ok: true,
      targets: publicFoodDiaryPersonalTargets(data),
    })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

export async function handleFoodDiaryTargetsSet(db, ctx, body, res) {
  const parsed = parseFoodDiaryPersonalTargets(body)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }
  const now = new Date().toISOString()
  const row = {
    client_id: ctx.clientId,
    club_id: ctx.client.club_id,
    kcal: parsed.value.kcal,
    protein_g: parsed.value.protein_g,
    fat_g: parsed.value.fat_g,
    carbs_g: parsed.value.carbs_g,
    updated_at: now,
  }
  try {
    const { error } = await db.from('client_food_diary_targets').upsert(row, { onConflict: 'client_id' })
    if (error) throw error
    sendJson(res, 200, {
      ok: true,
      targets: publicFoodDiaryPersonalTargets(row),
    })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}
