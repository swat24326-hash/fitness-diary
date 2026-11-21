/**
 * GET admin-data?action=food-diary-client&client_id=&date=
 * GET admin-data?action=food-diary-roster&date=
 * Тренер/админ: сводка дня клиента + список своих клиентов за день.
 */
import { sendJson } from '../adminSupabase.js'
import { canAccessClient } from '../mutationAuth.js'
import { clubOpsAsOfIso } from './loyaltyAccountQuery.js'
import { clubFoodDiaryEnabled } from '../../../src/lib/client/foodDiaryClubCore.js'
import {
  parseFoodDiaryDate,
  publicFoodDiaryEntry,
  sumFoodDiaryDay,
} from '../../../src/lib/client/foodDiaryDayCore.js'
import { buildFoodDiaryRosterRow } from '../../../src/lib/client/foodDiaryRosterCore.js'
import { compareFoodDiaryToPlan, nutritionPlanTargetKcal } from '../../../src/lib/client/foodDiaryVsPlanCore.js'

const ENTRY_SELECT =
  'id, entry_date, meal_key, name, grams, kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g, sodium_mg'

function isMissingTable(e) {
  return /client_food_diary_entries|42P01|PGRST205|does not exist/i.test(String(e?.message ?? e?.code ?? ''))
}

async function loadPlanKcal(db, clientId) {
  try {
    const { data: health } = await db
      .from('client_health_cards')
      .select('data')
      .eq('client_id', clientId)
      .maybeSingle()
    const fromHealth = nutritionPlanTargetKcal(health?.data?.nutrition_plan)
    if (fromHealth) return fromHealth
  } catch {
    /* ignore */
  }
  try {
    const { data: plans } = await db
      .from('client_plans')
      .select('payload, kind, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(8)
    for (const p of plans ?? []) {
      const kind = String(p.kind ?? '')
      if (kind && !/nutrition|ration|food/i.test(kind)) continue
      const k = nutritionPlanTargetKcal(p.payload)
      if (k) return k
    }
  } catch {
    /* ignore */
  }
  return null
}

export async function handleFoodDiaryClientGet(authCtx, req, res) {
  if (!authCtx.isAdmin && !authCtx.isTrainer && !authCtx.isSupervisor) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return
  }
  const clientId = String(req.query?.client_id ?? '').trim()
  if (!clientId) {
    sendJson(res, 400, { error: 'Укажите client_id' })
    return
  }
  if (!(await canAccessClient(authCtx, clientId))) {
    sendJson(res, 403, { error: 'Нет доступа к клиенту' })
    return
  }

  const db = authCtx.supabaseAdmin
  const { data: client, error: clientErr } = await db
    .from('clients')
    .select('id, club_id, name')
    .eq('id', clientId)
    .maybeSingle()
  if (clientErr) {
    sendJson(res, 400, { error: clientErr.message })
    return
  }
  if (!client) {
    sendJson(res, 404, { error: 'Клиент не найден' })
    return
  }

  const { data: club } = await db.from('clubs').select('food_diary_enabled').eq('id', client.club_id).maybeSingle()
  if (!clubFoodDiaryEnabled(club)) {
    sendJson(res, 200, {
      ok: true,
      enabled: false,
      client_id: clientId,
      message: 'Дневник калорий выключен для клуба',
    })
    return
  }

  const today = clubOpsAsOfIso()
  const parsed = parseFoodDiaryDate(req.query?.date ?? req.query?.entry_date ?? today, today)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  try {
    const { data, error } = await db
      .from('client_food_diary_entries')
      .select(ENTRY_SELECT)
      .eq('client_id', clientId)
      .eq('entry_date', parsed.date)
      .order('created_at', { ascending: true })
    if (error) throw error
    const entries = (data ?? []).map((r) => publicFoodDiaryEntry(r)).filter(Boolean)
    const totals = sumFoodDiaryDay(entries)
    const planKcal = await loadPlanKcal(db, clientId)
    const vs_plan = compareFoodDiaryToPlan(totals, planKcal)

    let water_ml = null
    try {
      const { data: waterRows } = await db
        .from('client_food_diary_water')
        .select('ml')
        .eq('client_id', clientId)
        .eq('entry_date', parsed.date)
        .limit(1)
      if (waterRows?.[0]) water_ml = Number(waterRows[0].ml) || 0
    } catch {
      water_ml = null
    }

    sendJson(res, 200, {
      ok: true,
      enabled: true,
      client_id: clientId,
      entry_date: parsed.date,
      entries,
      totals,
      water_ml,
      vs_plan,
    })
  } catch (e) {
    if (isMissingTable(e)) {
      sendJson(res, 503, { error: 'Дневник калорий ещё не подключен — обновите клуб' })
      return
    }
    throw e
  }
}

/**
 * Список своих клиентов клуба с дневником: факт/цель за день без блюд.
 */
export async function handleFoodDiaryRosterGet(authCtx, req, res) {
  if (!authCtx.isAdmin && !authCtx.isTrainer && !authCtx.isSupervisor) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return
  }
  const db = authCtx.supabaseAdmin
  const today = clubOpsAsOfIso()
  const parsed = parseFoodDiaryDate(req.query?.date ?? req.query?.entry_date ?? today, today)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  let clientsQuery = db
    .from('clients')
    .select('id, name, club_id, trainer_id, archived_at')
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (authCtx.isTrainer && !authCtx.isAdmin) {
    clientsQuery = clientsQuery.eq('trainer_id', authCtx.user.id)
  } else if (authCtx.isSupervisor && !authCtx.isAdmin) {
    const club = String(authCtx.profile?.club_id ?? authCtx.supervisorClubId ?? '').trim()
    if (!club) {
      sendJson(res, 403, { error: 'Не указан клуб' })
      return
    }
    clientsQuery = clientsQuery.eq('club_id', club)
  }

  try {
    const { data: clients, error: clientsErr } = await clientsQuery
    if (clientsErr) throw clientsErr
    const list = clients ?? []
    if (!list.length) {
      sendJson(res, 200, { ok: true, enabled: true, entry_date: parsed.date, clients: [] })
      return
    }

    const clubIds = [...new Set(list.map((c) => c.club_id).filter(Boolean))]
    const { data: clubs } = await db.from('clubs').select('id, food_diary_enabled').in('id', clubIds)
    const enabledClubs = new Set(
      (clubs ?? []).filter((c) => clubFoodDiaryEnabled(c)).map((c) => String(c.id)),
    )
    const scoped = list.filter((c) => enabledClubs.has(String(c.club_id)))
    if (!scoped.length) {
      sendJson(res, 200, {
        ok: true,
        enabled: false,
        entry_date: parsed.date,
        clients: [],
        message: 'Дневник калорий выключен для клуба',
      })
      return
    }

    const ids = scoped.map((c) => c.id)
    const { data: entries, error: entErr } = await db
      .from('client_food_diary_entries')
      .select('client_id, kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g, sodium_mg')
      .in('client_id', ids)
      .eq('entry_date', parsed.date)
    if (entErr) throw entErr

    const byClient = new Map()
    for (const row of entries ?? []) {
      const id = String(row.client_id)
      if (!byClient.has(id)) byClient.set(id, [])
      byClient.get(id).push(row)
    }

    const planByClient = new Map()
    await Promise.all(
      scoped.map(async (c) => {
        planByClient.set(String(c.id), await loadPlanKcal(db, c.id))
      }),
    )

    const rows = scoped.map((c) => {
      const dayRows = byClient.get(String(c.id)) ?? []
      const totals = sumFoodDiaryDay(dayRows)
      return buildFoodDiaryRosterRow({
        clientId: c.id,
        name: c.name,
        totals,
        planKcal: planByClient.get(String(c.id)) ?? null,
      })
    })

    sendJson(res, 200, {
      ok: true,
      enabled: true,
      entry_date: parsed.date,
      clients: rows,
    })
  } catch (e) {
    if (isMissingTable(e)) {
      sendJson(res, 503, { error: 'Дневник калорий ещё не подключен — обновите клуб' })
      return
    }
    throw e
  }
}
