/**
 * Воскресный авто-рацион: пересчёт КБЖУ при смене веса ≥ 3 кг → client_plans + push.
 * Cron: scripts/client-reminders-vm.mjs (то же окно, что у авто-ДЗ).
 */
import { calendarDayInTimeZoneIso, calendarDayStartUtcIso, todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { normalizeClientPlanPushPayload } from '../../../src/lib/clientPlans/clientPlanCore.js'
import { buildNutritionCatalogMap } from '../../../src/lib/nutrition/nutritionCatalogResolve.js'
import { normalizeNutritionSurvey } from '../../../src/lib/nutrition/nutritionPlanBuilder.js'
import {
  NUTRITION_AUTO_MANUAL_DAYS,
  NUTRITION_AUTO_SEND_FROM_MIN,
  NUTRITION_AUTO_SEND_TO_MIN,
  addDaysIso,
  buildNutritionAutoPlan,
  buildNutritionAutoTrainerPush,
  isSundayIso,
  nutritionAutoHoldReason,
  nutritionAutoPlanId,
  nutritionAutoPrefsFromSurvey,
  nutritionAutoTrainerCardPath,
  nutritionAutoWeightDeltaKg,
} from '../../../src/lib/nutrition/nutritionAutoScheduleCore.js'
import { clubOpsMinutesNow } from '../clientPortal/clientReminderCore.js'
import { notifyClientPlanSent } from '../clientPlans/clientPlanNotify.js'
import { isWebPushConfigured, sendPushToUser } from '../webPushCore.js'

const BATCH = 80

const HEALTH_SELECT =
  'id, client_id, height_cm, sex, goal, current_weight_kg, weight_kg, nutrition_survey, nutrition_plan, nutrition_plan_generated_at, nutrition_plan_history, diseases, contraindications, medications, notes, health_filled_at, initial_weight_kg, weight_updated_at, updated_at'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function byKey(list, key) {
  return new Map(list.map((r) => [String(r[key]), r]))
}

function parseJson(v) {
  if (v == null) return null
  if (typeof v === 'object') return v
  try {
    return JSON.parse(String(v))
  } catch {
    return null
  }
}

async function sendBatch(db, healthRows, { sunday, now, notify, stats, productsByClub }) {
  const ids = healthRows.map((h) => String(h.client_id))
  const planIds = ids.map((id) => nutritionAutoPlanId(id, sunday))
  const manualSince = calendarDayStartUtcIso(addDaysIso(sunday, -NUTRITION_AUTO_MANUAL_DAYS))
  const [clients, done, recent] = await Promise.all([
    rows(db.from('clients').select('id, name, trainer_id, club_id, archived_at').in('id', ids)),
    rows(db.from('client_plans').select('id').in('id', planIds)),
    rows(
      db
        .from('client_plans')
        .select('id, client_id, sent_at')
        .in('client_id', ids)
        .eq('kind', 'nutrition')
        .gte('sent_at', manualSince),
    ),
  ])
  const clientById = byKey(clients, 'id')
  const doneIds = new Set(done.map((r) => String(r.id)))
  const lastManual = new Map()
  for (const p of recent) {
    if (planIds.includes(String(p.id))) continue
    const day = calendarDayInTimeZoneIso(p.sent_at)
    const cid = String(p.client_id)
    if (day > (lastManual.get(cid) ?? '')) lastManual.set(cid, day)
  }

  for (const healthRaw of healthRows) {
    const cid = String(healthRaw.client_id)
    const plan = parseJson(healthRaw.nutrition_plan)
    const survey = normalizeNutritionSurvey(parseJson(healthRaw.nutrition_survey))
    const prefs = nutritionAutoPrefsFromSurvey(survey)
    if (!prefs.enabled) {
      stats.held.off = (stats.held.off ?? 0) + 1
      continue
    }
    if (doneIds.has(nutritionAutoPlanId(cid, sunday))) {
      stats.already += 1
      continue
    }
    const client = clientById.get(cid) ?? null
    const reason = nutritionAutoHoldReason({
      enabled: true,
      skipDate: prefs.skipDate,
      client,
      health: healthRaw,
      plan,
      sundayIso: sunday,
      lastManualDay: lastManual.get(cid) ?? null,
    })
    if (reason) {
      stats.held[reason] = (stats.held[reason] ?? 0) + 1
      continue
    }
    const clubId = client?.club_id ? String(client.club_id) : ''
    const catalogMap = productsByClub.get(clubId) ?? productsByClub.get('') ?? buildNutritionCatalogMap([])
    const built = buildNutritionAutoPlan({
      client,
      health: healthRaw,
      survey,
      plan,
      catalogMap,
      sundayIso: sunday,
      now,
    })
    const prep = built.ok ? normalizeClientPlanPushPayload(built.planRow) : { ok: false }
    if (!built.ok || !prep.ok) {
      stats.failed += 1
      continue
    }

    const { error: hcErr } = await db
      .from('health_cards')
      .update({
        nutrition_plan: built.nextPlan,
        nutrition_survey: { ...survey, nutritionAutoPush: true },
        nutrition_plan_generated_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', healthRaw.id)
    if (hcErr) {
      stats.failed += 1
      console.warn('[nutrition-auto] health', cid, hcErr.code || '', hcErr.message || '')
      continue
    }

    const { error } = await db.from('client_plans').insert(prep.data)
    if (error) {
      if (error.code === '23505') stats.already += 1
      else {
        stats.failed += 1
        console.warn('[nutrition-auto] insert', cid, error.code || '', error.message || '')
      }
      continue
    }
    stats.sent += 1
    await notify(db, prep.data, { now }).catch((e) => console.warn('[nutrition-auto] push', e?.message || e))
    await notifyTrainerNutritionAuto(db, {
      client,
      deltaKg: nutritionAutoWeightDeltaKg(healthRaw, plan),
    }).catch((e) => console.warn('[nutrition-auto] trainer-push', e?.message || e))
  }
}

/** Push тренеру клиента: рацион ушёл сам из‑за веса. */
export async function notifyTrainerNutritionAuto(db, { client, deltaKg } = {}) {
  const trainerId = String(client?.trainer_id ?? '').trim()
  if (!trainerId || !isWebPushConfigured()) return { skipped: true }
  const payload = buildNutritionAutoTrainerPush({
    clientName: client?.name,
    deltaKg,
    url: nutritionAutoTrainerCardPath(client?.id),
  })
  return sendPushToUser(db, trainerId, payload)
}

/** @returns {Promise<{ skipped: string } | { sunday: string, sent: number, already: number, failed: number, held: Record<string, number> }>} */
export async function runNutritionAutoSend({ db, now = new Date(), notify = notifyClientPlanSent } = {}) {
  const sunday = todayInTimeZoneIso(undefined, now)
  const minutes = clubOpsMinutesNow(now)
  if (!isSundayIso(sunday) || minutes < NUTRITION_AUTO_SEND_FROM_MIN || minutes >= NUTRITION_AUTO_SEND_TO_MIN) {
    return { skipped: 'not_sunday_window' }
  }
  const stats = { sunday, sent: 0, already: 0, failed: 0, held: {} }

  const allProducts = await rows(db.from('nutrition_products').select('*').eq('is_active', true))
  const productsByClub = new Map()
  productsByClub.set('', buildNutritionCatalogMap([]))
  const byClub = new Map()
  for (const row of allProducts) {
    const cid = String(row.club_id ?? '')
    if (!byClub.has(cid)) byClub.set(cid, [])
    byClub.get(cid).push(row)
  }
  for (const [cid, list] of byClub) {
    productsByClub.set(cid, buildNutritionCatalogMap(list))
  }

  let after = '00000000-0000-0000-0000-000000000000'
  for (;;) {
    const page = await rows(
      db
        .from('health_cards')
        .select(HEALTH_SELECT)
        .not('nutrition_plan', 'is', null)
        .gt('id', after)
        .order('id', { ascending: true })
        .limit(BATCH),
    )
    if (!page.length) break
    after = String(page[page.length - 1].id)
    const candidates = page.filter((h) => nutritionAutoPrefsFromSurvey(parseJson(h.nutrition_survey)).enabled)
    if (candidates.length) await sendBatch(db, candidates, { sunday, now, notify, stats, productsByClub })
    if (page.length < BATCH) break
  }
  return stats
}
