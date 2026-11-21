/**
 * POST /api/client-me { action: 'food-diary-*' }
 * Только при clubs.food_diary_enabled; только свои строки.
 */
import { randomUUID } from 'node:crypto'
import { sendJson } from '../adminSupabase.js'
import { clubOpsAsOfIso } from '../adminData/loyaltyAccountQuery.js'
import { clubFoodDiaryEnabled } from '../../../src/lib/client/foodDiaryClubCore.js'
import {
  parseFoodDiaryDate,
  parseFoodDiaryUpsert,
  publicFoodDiaryEntry,
  sumFoodDiaryDay,
} from '../../../src/lib/client/foodDiaryDayCore.js'
import {
  handleFoodDiaryBarcode,
  handleFoodDiaryCopy,
  handleFoodDiaryFrequent,
  handleFoodDiarySearch,
  handleFoodDiaryFromPlan,
  handleFoodDiaryTargetsGet,
  handleFoodDiaryTargetsSet,
  handleFoodDiaryWaterGet,
  handleFoodDiaryWaterSet,
  handleFoodDiaryWeek,
} from './foodDiaryClientExtras.js'

const SELECT =
  'id, client_id, club_id, entry_date, meal_key, name, grams, kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g, sodium_mg, created_at'

export function isFoodDiaryAction(action) {
  return String(action ?? '').startsWith('food-diary-')
}

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function missingSchema(res) {
  sendJson(res, 503, { error: 'Дневник калорий ещё не подключен — обновите клуб' })
}

function isMissingTable(e) {
  return /client_food_diary_entries|42P01|PGRST205|does not exist/i.test(String(e?.message ?? e?.code ?? ''))
}

async function loadClubFlag(db, clubId) {
  const { data, error } = await db.from('clubs').select('food_diary_enabled').eq('id', clubId).maybeSingle()
  if (error) throw error
  return data
}

async function requireEnabled(db, ctx, res) {
  const club = await loadClubFlag(db, ctx.client.club_id)
  if (!clubFoodDiaryEnabled(club)) {
    sendJson(res, 403, { error: 'Дневник калорий выключен для вашего клуба' })
    return false
  }
  return true
}

async function loadDay(db, clientId, entryDate) {
  return rows(
    db
      .from('client_food_diary_entries')
      .select(SELECT)
      .eq('client_id', clientId)
      .eq('entry_date', entryDate)
      .order('created_at', { ascending: true }),
  )
}

function dayPayload(entryDate, list) {
  const entries = list.map((r) => publicFoodDiaryEntry(r)).filter(Boolean)
  return { entry_date: entryDate, entries, totals: sumFoodDiaryDay(entries) }
}

async function handleDay(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const parsed = parseFoodDiaryDate(body?.entry_date ?? body?.date ?? today, today)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }
  try {
    const list = await loadDay(db, ctx.clientId, parsed.date)
    sendJson(res, 200, { ok: true, ...dayPayload(parsed.date, list) })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

async function handleUpsert(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const parsed = parseFoodDiaryUpsert(body, today)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }
  const now = new Date().toISOString()
  try {
    if (parsed.id) {
      const found = await rows(
        db
          .from('client_food_diary_entries')
          .select(SELECT)
          .eq('id', parsed.id)
          .eq('client_id', ctx.clientId)
          .limit(1),
      )
      if (!found[0]) {
        sendJson(res, 404, { error: 'Запись не найдена' })
        return
      }
      const { data, error } = await db
        .from('client_food_diary_entries')
        .update({
          entry_date: parsed.entry_date,
          meal_key: parsed.meal_key,
          name: parsed.name,
          grams: parsed.grams,
          kcal: parsed.kcal,
          protein_g: parsed.protein_g,
          fat_g: parsed.fat_g,
          carbs_g: parsed.carbs_g,
          fiber_g: parsed.fiber_g,
          sugar_g: parsed.sugar_g,
          sodium_mg: parsed.sodium_mg,
          updated_at: now,
        })
        .eq('id', parsed.id)
        .eq('client_id', ctx.clientId)
        .select(SELECT)
        .maybeSingle()
      if (error) throw error
      const list = await loadDay(db, ctx.clientId, parsed.entry_date)
      sendJson(res, 200, { ok: true, entry: publicFoodDiaryEntry(data), ...dayPayload(parsed.entry_date, list) })
      return
    }
    const id = randomUUID()
    const { data, error } = await db
      .from('client_food_diary_entries')
      .insert({
        id,
        client_id: ctx.clientId,
        club_id: ctx.client.club_id,
        entry_date: parsed.entry_date,
        meal_key: parsed.meal_key,
        name: parsed.name,
        grams: parsed.grams,
        kcal: parsed.kcal,
        protein_g: parsed.protein_g,
        fat_g: parsed.fat_g,
        carbs_g: parsed.carbs_g,
        fiber_g: parsed.fiber_g,
        sugar_g: parsed.sugar_g,
        sodium_mg: parsed.sodium_mg,
        created_at: now,
        updated_at: now,
      })
      .select(SELECT)
      .maybeSingle()
    if (error) throw error
    const list = await loadDay(db, ctx.clientId, parsed.entry_date)
    sendJson(res, 200, { ok: true, entry: publicFoodDiaryEntry(data), ...dayPayload(parsed.entry_date, list) })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

async function handleDelete(db, ctx, body, res) {
  const id = String(body?.id ?? '').trim()
  if (!id) {
    sendJson(res, 400, { error: 'Не указана запись' })
    return
  }
  const today = clubOpsAsOfIso()
  try {
    const found = await rows(
      db.from('client_food_diary_entries').select(SELECT).eq('id', id).eq('client_id', ctx.clientId).limit(1),
    )
    if (!found[0]) {
      sendJson(res, 404, { error: 'Запись не найдена' })
      return
    }
    const entryDate = String(found[0].entry_date).slice(0, 10)
    const { error } = await db.from('client_food_diary_entries').delete().eq('id', id).eq('client_id', ctx.clientId)
    if (error) throw error
    const list = await loadDay(db, ctx.clientId, entryDate)
    const dateOk = parseFoodDiaryDate(entryDate, today)
    const dayDate = dateOk.ok ? entryDate : today
    sendJson(res, 200, { ok: true, ...dayPayload(dayDate, list) })
  } catch (e) {
    if (isMissingTable(e)) return missingSchema(res)
    throw e
  }
}

export async function handleFoodDiaryClientPost(db, ctx, body, res) {
  if (!(await requireEnabled(db, ctx, res))) return
  const action = String(body?.action ?? '')
  if (action === 'food-diary-day') return handleDay(db, ctx, body, res)
  if (action === 'food-diary-upsert') return handleUpsert(db, ctx, body, res)
  if (action === 'food-diary-delete') return handleDelete(db, ctx, body, res)
  if (action === 'food-diary-search') return handleFoodDiarySearch(db, ctx, body, res)
  if (action === 'food-diary-barcode') return handleFoodDiaryBarcode(db, ctx, body, res)
  if (action === 'food-diary-frequent') return handleFoodDiaryFrequent(db, ctx, body, res)
  if (action === 'food-diary-copy') return handleFoodDiaryCopy(db, ctx, body, res)
  if (action === 'food-diary-water') return handleFoodDiaryWaterGet(db, ctx, body, res)
  if (action === 'food-diary-water-set') return handleFoodDiaryWaterSet(db, ctx, body, res)
  if (action === 'food-diary-week') return handleFoodDiaryWeek(db, ctx, body, res)
  if (action === 'food-diary-from-plan') return handleFoodDiaryFromPlan(db, ctx, body, res)
  if (action === 'food-diary-targets') return handleFoodDiaryTargetsGet(db, ctx, body, res)
  if (action === 'food-diary-targets-set') return handleFoodDiaryTargetsSet(db, ctx, body, res)
  sendJson(res, 400, { error: 'Неизвестное действие дневника' })
}
