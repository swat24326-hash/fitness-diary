/**
 * Подмена food-diary-* для /api/client-me и food-diary-roster для admin-data.
 */
import { randomUUID } from 'node:crypto'
import { clubFoodDiaryEnabled } from '../../../src/lib/client/foodDiaryClubCore.js'
import {
  parseFoodDiaryDate,
  publicFoodDiaryEntry,
  sumFoodDiaryDay,
} from '../../../src/lib/client/foodDiaryDayCore.js'
import {
  parseFoodDiaryFromPlanRequest,
  resolveFoodDiaryFromPlanConflict,
} from '../../../src/lib/client/foodDiaryFromPlanCore.js'
import {
  parseFoodDiaryPersonalTargets,
  publicFoodDiaryPersonalTargets,
} from '../../../src/lib/client/foodDiaryPersonalTargetsCore.js'
import { buildFoodDiaryRosterRow } from '../../../src/lib/client/foodDiaryRosterCore.js'
import { compareFoodDiaryToPlan, nutritionPlanTargetKcal } from '../../../src/lib/client/foodDiaryVsPlanCore.js'
import { buildFoodDiaryWeekSeries, foodDiaryWeekRangeEnding } from '../../../src/lib/client/foodDiaryWeekCore.js'

function clubEnabled(state, clientId) {
  const client = state.clients.find((c) => c.id === clientId)
  const club = state.clubs.find((c) => c.id === client?.club_id)
  return clubFoodDiaryEnabled(club)
}

function dayEntries(state, clientId, date) {
  return (state.client_food_diary_entries ?? []).filter(
    (e) => e.client_id === clientId && String(e.entry_date).slice(0, 10) === date,
  )
}

function dayPayload(date, list) {
  const entries = list.map((r) => publicFoodDiaryEntry(r)).filter(Boolean)
  return { entry_date: date, entries, totals: sumFoodDiaryDay(entries) }
}

/**
 * @param {object} state
 * @param {{ clientId: string, today: string }} opts
 * @returns {(body: object) => object|null}
 */
export function createFakeFoodDiaryClient(state, { clientId, today }) {
  return (body) => {
    const action = String(body?.action ?? '')
    if (!action.startsWith('food-diary-')) return null
    if (!clubEnabled(state, clientId)) {
      return { status: 403, json: { error: 'Дневник калорий выключен для вашего клуба' } }
    }
    const client = state.clients.find((c) => c.id === clientId)
    state.client_food_diary_entries ??= []
    state.client_food_diary_water ??= []
    state.client_food_diary_targets ??= {}

    if (action === 'food-diary-day') {
      const parsed = parseFoodDiaryDate(body?.entry_date ?? body?.date ?? today, today)
      if (!parsed.ok) return { status: 400, json: { error: parsed.error } }
      return { status: 200, json: { ok: true, ...dayPayload(parsed.date, dayEntries(state, clientId, parsed.date)) } }
    }

    if (action === 'food-diary-upsert') {
      const parsed = parseFoodDiaryDate(body?.entry_date ?? today, today)
      if (!parsed.ok) return { status: 400, json: { error: parsed.error } }
      const id = String(body?.id ?? '').trim() || randomUUID()
      const row = {
        id,
        client_id: clientId,
        club_id: client.club_id,
        entry_date: parsed.date,
        meal_key: body.meal_key || 'breakfast',
        name: String(body.name || 'Блюдо').slice(0, 120),
        grams: body.grams ?? null,
        kcal: Number(body.kcal) || 0,
        protein_g: Number(body.protein_g) || 0,
        fat_g: Number(body.fat_g) || 0,
        carbs_g: Number(body.carbs_g) || 0,
        fiber_g: Number(body.fiber_g) || 0,
        sugar_g: Number(body.sugar_g) || 0,
        sodium_mg: Number(body.sodium_mg) || 0,
        created_at: new Date().toISOString(),
      }
      state.client_food_diary_entries = state.client_food_diary_entries.filter((e) => e.id !== id)
      state.client_food_diary_entries.push(row)
      return {
        status: 200,
        json: { ok: true, entry: publicFoodDiaryEntry(row), ...dayPayload(parsed.date, dayEntries(state, clientId, parsed.date)) },
      }
    }

    if (action === 'food-diary-delete') {
      const id = String(body?.id ?? '').trim()
      const found = state.client_food_diary_entries.find((e) => e.id === id && e.client_id === clientId)
      if (!found) return { status: 404, json: { error: 'Запись не найдена' } }
      const date = found.entry_date
      state.client_food_diary_entries = state.client_food_diary_entries.filter((e) => e.id !== id)
      return { status: 200, json: { ok: true, ...dayPayload(date, dayEntries(state, clientId, date)) } }
    }

    if (action === 'food-diary-frequent') {
      return { status: 200, json: { ok: true, frequent: [] } }
    }

    if (action === 'food-diary-water') {
      const parsed = parseFoodDiaryDate(body?.entry_date ?? today, today)
      if (!parsed.ok) return { status: 400, json: { error: parsed.error } }
      const row = state.client_food_diary_water.find(
        (w) => w.client_id === clientId && w.entry_date === parsed.date,
      )
      return { status: 200, json: { ok: true, entry_date: parsed.date, ml: Number(row?.ml) || 0 } }
    }

    if (action === 'food-diary-water-set') {
      const parsed = parseFoodDiaryDate(body?.entry_date ?? today, today)
      if (!parsed.ok) return { status: 400, json: { error: parsed.error } }
      const ml = Math.max(0, Math.min(8000, Math.round(Number(body.ml) || 0)))
      state.client_food_diary_water = state.client_food_diary_water.filter(
        (w) => !(w.client_id === clientId && w.entry_date === parsed.date),
      )
      state.client_food_diary_water.push({ client_id: clientId, club_id: client.club_id, entry_date: parsed.date, ml })
      return { status: 200, json: { ok: true, entry_date: parsed.date, ml } }
    }

    if (action === 'food-diary-week') {
      const endRaw = body?.end_date ?? body?.to ?? today
      const range = foodDiaryWeekRangeEnding(endRaw)
      if (!range.ok) return { status: 400, json: { error: range.error } }
      const list = (state.client_food_diary_entries ?? []).filter(
        (e) => e.client_id === clientId && e.entry_date >= range.from && e.entry_date <= range.to,
      )
      const series = buildFoodDiaryWeekSeries(list, range.dates)
      return {
        status: 200,
        json: {
          ok: true,
          from: range.from,
          to: range.to,
          days: series.days,
          week_totals: series.weekTotals,
          days_with_food: series.daysWithFood,
          avg_kcal: series.avgKcal,
        },
      }
    }

    if (action === 'food-diary-targets') {
      return {
        status: 200,
        json: { ok: true, targets: publicFoodDiaryPersonalTargets(state.client_food_diary_targets[clientId]) },
      }
    }

    if (action === 'food-diary-targets-set') {
      const parsed = parseFoodDiaryPersonalTargets(body)
      if (!parsed.ok) return { status: 400, json: { error: parsed.error } }
      state.client_food_diary_targets[clientId] = { ...parsed.value, client_id: clientId }
      return { status: 200, json: { ok: true, targets: publicFoodDiaryPersonalTargets(parsed.value) } }
    }

    if (action === 'food-diary-from-plan') {
      let planPayload = body?.plan_payload
      const planId = String(body?.plan_id ?? '').trim()
      if (planId) {
        const plan = (state.client_plans ?? []).find((p) => p.id === planId && p.client_id === clientId)
        if (!plan) return { status: 404, json: { error: 'Рацион не найден' } }
        planPayload = plan.payload
      }
      const parsed = parseFoodDiaryFromPlanRequest({ ...body, plan_payload: planPayload }, today)
      if (!parsed.ok) return { status: 400, json: { error: parsed.error } }
      const existing = dayEntries(state, clientId, parsed.entry_date)
      const occupied = [...new Set(existing.map((r) => r.meal_key))]
      const resolution = resolveFoodDiaryFromPlanConflict(parsed.mode, occupied, parsed.rows)
      if (!resolution.ok) return { status: 400, json: { error: resolution.error } }
      if (resolution.delete_meal_keys?.length) {
        const del = new Set(resolution.delete_meal_keys)
        state.client_food_diary_entries = state.client_food_diary_entries.filter(
          (e) => !(e.client_id === clientId && e.entry_date === parsed.entry_date && del.has(e.meal_key)),
        )
      }
      for (const r of resolution.rows || []) {
        state.client_food_diary_entries.push({
          id: randomUUID(),
          client_id: clientId,
          club_id: client.club_id,
          entry_date: parsed.entry_date,
          ...r,
          created_at: new Date().toISOString(),
        })
      }
      return {
        status: 200,
        json: {
          ok: true,
          inserted: (resolution.rows || []).length,
          mode: parsed.mode,
          ...dayPayload(parsed.entry_date, dayEntries(state, clientId, parsed.entry_date)),
        },
      }
    }

    if (action === 'food-diary-search' || action === 'food-diary-barcode' || action === 'food-diary-copy') {
      return { status: 200, json: { ok: true, hits: [], entries: [], totals: sumFoodDiaryDay([]) } }
    }

    return { status: 400, json: { error: 'Неизвестное действие дневника' } }
  }
}

/** GET admin-data?action=food-diary-roster|food-diary-client (user — как у тренера: только свои). */
export function createFakeFoodDiaryAdmin(state, { today }) {
  return (req, user) => {
    const action = String(req.searchParams?.get('action') ?? '')
    if (action !== 'food-diary-roster' && action !== 'food-diary-client') return null

    if (action === 'food-diary-client') {
      const clientId = String(req.searchParams.get('client_id') ?? '').trim()
      if (!clientId) return { status: 400, json: { error: 'Укажите client_id' } }
      if (!clubEnabled(state, clientId)) {
        return { status: 200, json: { ok: true, enabled: false, client_id: clientId } }
      }
      const parsed = parseFoodDiaryDate(req.searchParams.get('date') ?? today, today)
      if (!parsed.ok) return { status: 400, json: { error: parsed.error } }
      const list = dayEntries(state, clientId, parsed.date)
      const totals = sumFoodDiaryDay(list)
      const plan = (state.client_plans ?? []).find((p) => p.client_id === clientId && p.kind === 'nutrition')
      const planKcal = nutritionPlanTargetKcal(plan?.payload) ?? null
      return {
        status: 200,
        json: {
          ok: true,
          enabled: true,
          client_id: clientId,
          entry_date: parsed.date,
          entries: list.map(publicFoodDiaryEntry),
          totals,
          vs_plan: compareFoodDiaryToPlan(totals, planKcal),
        },
      }
    }

    const parsed = parseFoodDiaryDate(req.searchParams.get('date') ?? today, today)
    if (!parsed.ok) return { status: 400, json: { error: parsed.error } }
    const trainerOnly = user?.role === 'trainer'
    const clients = (state.clients ?? []).filter((c) => {
      if (c.archived_at) return false
      if (trainerOnly && String(c.trainer_id ?? '') !== String(user.id)) return false
      return true
    })
    const rows = clients
      .filter((c) => clubEnabled(state, c.id))
      .map((c) => {
        const totals = sumFoodDiaryDay(dayEntries(state, c.id, parsed.date))
        const plan = (state.client_plans ?? []).find((p) => p.client_id === c.id && p.kind === 'nutrition')
        return buildFoodDiaryRosterRow({
          clientId: c.id,
          name: c.name,
          totals,
          planKcal: nutritionPlanTargetKcal(plan?.payload) ?? null,
        })
      })
    return {
      status: 200,
      json: { ok: true, enabled: rows.length > 0, entry_date: parsed.date, clients: rows },
    }
  }
}
