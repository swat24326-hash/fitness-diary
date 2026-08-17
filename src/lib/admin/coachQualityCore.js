/**
 * Качество работы тренера: ведение (care), глубина дневника (depth), хвосты базы (bag/stuck).
 * Чистые правила без React/IDB.
 */
import { isNutritionPlanStale } from '../nutrition/nutritionPlanStaleCore.js'
import {
  inactiveMembershipReason,
  pickUsableMembershipForDate,
} from '../membershipRules.js'
import { isPnkTrialTypeRow } from '../pnk/pnkTrialTrainingCore.js'
import { daysSinceIsoDate, membershipDaysSinceLatestEnd } from '../trainer/trainerClientOutreachCore.js'
import { todayLocalIso } from '../dateRu.js'
import { getHealthCardCompletionIssues } from '../healthCardCore.js'
import { getHealthCurrentWeightKg, getHealthInitialWeightKg } from '../clientWeightCore.js'
import {
  normalizeCoachQualityConfig,
  coachQualityRulesHelpFromConfig,
} from './coachQualityConfigCore.js'
import { trainingSetRowHasData } from '../trainingSetLateralityCore.js'

export const COACH_QUALITY_PERIOD_DAYS = 30
export const COACH_QUALITY_MIN_COMPLETED = 8
export const COACH_QUALITY_MIN_ACTIVE_CLIENTS = 3
export const COACH_QUALITY_NUTRITION_STALE_GRACE_DAYS = 7
export const COACH_QUALITY_INACTIVE_GRACE_DAYS = 7
export const COACH_QUALITY_INACTIVE_WARN_DAYS = 14
export const COACH_QUALITY_STUCK_DAYS = 14
export const COACH_QUALITY_CARE_OK = 85
export const COACH_QUALITY_CARE_WARN = 70
export const COACH_QUALITY_DEPTH_OK = 70
export const COACH_QUALITY_DEPTH_BAD = 50

/** @typedef {'ok'|'attention'|'review'|'insufficient_data'} CoachQualityStatus */
/** @typedef {'care'|'depth'|'bag'} CoachQualityAxis */
/** @typedef {'f0_health_empty'|'f1_nutrition_missing'|'f1_nutrition_stale'|'f2_measures'|'thin_training'|'stuck_dk'|'stuck_bz'|'inactive_corridor'} CoachQualityFactKind */

/**
 * Тонкая завершённая тренировка: ровно 1 упражнение с данными или ≤2 set-строк.
 * @param {object|null|undefined} workout data / training.data
 */
export function isThinCompletedTraining(workout) {
  const w = workout && typeof workout === 'object' ? workout : {}
  const exercises = Array.isArray(w.exercises) ? w.exercises : []
  let withData = 0
  let setRows = 0
  for (const ex of exercises) {
    if (!ex?.catalog_exercise_id) continue
    const sets = Array.isArray(ex.sets) ? ex.sets : []
    const has = sets.some((s) => trainingSetRowHasData(s))
    if (!has) continue
    withData++
    for (const s of sets) {
      if (trainingSetRowHasData(s)) setRows++
    }
  }
  if (withData <= 0) return true
  if (withData === 1) return true
  if (setRows <= 2) return true
  return false
}

/**
 * Обмеры уместны: цель на тело/форму или контур уже начат.
 * @param {object|null|undefined} health
 * @param {boolean} hadAnyMeasure
 */
export function areBodyMeasuresApplicable(health, hadAnyMeasure) {
  if (hadAnyMeasure) return true
  const goal = String(health?.goal ?? '')
    .trim()
    .toLowerCase()
  if (!goal) return false
  return /похуд|рекомпоз|сниж|жир|форм|вес|набор|сушк|коррекц|сгон/i.test(goal)
}

/**
 * Дней с момента расхождения веса/роста с basis плана.
 * Если stale, но дату не восстановить — null (считаем критичным без льготы).
 * @param {object|null|undefined} health
 * @param {object|null|undefined} plan
 * @param {object[]} [weightEntries] { date, weight_kg }
 * @param {string} [todayIso]
 * @returns {number|null} null = stale без даты; 0 = не stale
 */
export function nutritionStaleDays(health, plan, weightEntries = [], todayIso = todayLocalIso()) {
  if (!plan || typeof plan !== 'object') return 0
  if (!isNutritionPlanStale(health, plan)) return 0
  const basisW = Number(plan?.basis?.weightKg)
  const basisH = Number(plan?.basis?.heightCm)
  const today = String(todayIso).slice(0, 10)

  const dates = []
  for (const e of weightEntries ?? []) {
    const d = String(e?.date ?? e?.recorded_at ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    const w = Number(String(e?.weight_kg ?? e?.kg ?? '').replace(',', '.'))
    if (!Number.isFinite(w) || !Number.isFinite(basisW)) continue
    if (Math.round(w * 10) !== Math.round(basisW * 10)) dates.push(d)
  }
  const h = Number(health?.height_cm)
  if (Number.isFinite(h) && Number.isFinite(basisH) && Math.round(h) !== Math.round(basisH)) {
    const filled = String(health?.health_filled_at ?? health?.updated_at ?? '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(filled)) dates.push(filled)
  }
  if (!dates.length) return null
  dates.sort()
  const first = dates[0]
  const days = daysSinceIsoDate(first, today)
  return days == null ? null : Math.max(0, days)
}

/**
 * Цель намекает на работу с весом/формой → нужен рацион.
 * @param {object|null|undefined} health
 */
export function clientNeedsNutritionPlan(health) {
  const goal = String(health?.goal ?? '')
    .trim()
    .toLowerCase()
  if (/похуд|рекомпоз|сниж|жир|форм|вес|набор|сушк|коррекц|сгон|питан/i.test(goal)) return true
  return getHealthCurrentWeightKg(health) != null || getHealthInitialWeightKg(health) != null
}

/**
 * Паспорт карты здоровья для активного клиента — те же минимумы, что для старта тренировки.
 * @returns {{ critical: boolean, reason: string|null }}
 */
export function evaluateHealthPassportFlag(health) {
  if (!health || typeof health !== 'object') {
    return { critical: true, reason: 'Нет карты здоровья' }
  }
  const issues = getHealthCardCompletionIssues(health)
  if (!issues.length) return { critical: false, reason: null }
  return {
    critical: true,
    reason: 'Карта здоровья не заполнена (рост, исходный вес, пол, дата)',
  }
}

/**
 * F1: нет плана (если нужен) или план stale дольше льготы.
 * @returns {{ critical: boolean, days: number|null, reason: string|null, kind: 'f1_nutrition_missing'|'f1_nutrition_stale'|null }}
 */
export function evaluateNutritionCareFlag(health, weightEntries, todayIso = todayLocalIso()) {
  const plan = health?.nutrition_plan
  if (!plan || typeof plan !== 'object') {
    if (clientNeedsNutritionPlan(health) || (weightEntries ?? []).length > 0) {
      return {
        critical: true,
        days: 0,
        reason: 'Нет плана рациона',
        kind: 'f1_nutrition_missing',
      }
    }
    return { critical: false, days: 0, reason: null, kind: null }
  }
  const days = nutritionStaleDays(health, plan, weightEntries, todayIso)
  if (days === 0) return { critical: false, days: 0, reason: null, kind: null }
  if (days == null) {
    return {
      critical: true,
      days: null,
      reason: 'Рацион устарел после смены веса/роста (дата смены неизвестна)',
      kind: 'f1_nutrition_stale',
    }
  }
  if (days > COACH_QUALITY_NUTRITION_STALE_GRACE_DAYS) {
    return {
      critical: true,
      days,
      reason: `Рацион не обновлён ${days} дн. после смены веса/роста`,
      kind: 'f1_nutrition_stale',
    }
  }
  return { critical: false, days, reason: null, kind: null }
}

/**
 * F2: нет обмеров за период при применимости.
 * @returns {{ critical: boolean, reason: string|null }}
 */
export function evaluateMeasuresCareFlag(health, lastMeasureIso, dateFrom, hadAnyMeasureEver) {
  if (!areBodyMeasuresApplicable(health, hadAnyMeasureEver)) {
    return { critical: false, reason: null }
  }
  const from = String(dateFrom ?? '').slice(0, 10)
  const last = String(lastMeasureIso ?? '').slice(0, 10)
  if (last && last >= from) return { critical: false, reason: null }
  return {
    critical: true,
    reason: last
      ? `Нет обмеров с ${from} (последний ${last})`
      : `Нет обмеров за период с ${from}`,
  }
}

/**
 * Дней без действующего абонемента (не not_started).
 * @returns {number|null} null = не считаем (есть usable / not_started / архив)
 */
export function daysWithoutUsableMembership(memList, todayIso, lastCompletedIso = null) {
  const today = String(todayIso).slice(0, 10)
  if (pickUsableMembershipForDate(memList ?? [], today)) return null
  const reason = inactiveMembershipReason(memList ?? [], today)
  if (reason === 'not_started') return null
  const sinceEnd = membershipDaysSinceLatestEnd(memList ?? [], today)
  if (sinceEnd != null && sinceEnd >= 0) return sinceEnd
  if (lastCompletedIso) {
    const d = daysSinceIsoDate(lastCompletedIso, today)
    if (d != null && d >= 0) return d
  }
  return 0
}

/**
 * @param {{
 *   client: object,
 *   memList: object[],
 *   membershipTypes?: object[],
 *   todayIso?: string,
 *   lastCompletedIso?: string|null,
 * }} input
 * @returns {{ stuck: boolean, kind: 'stuck_dk'|'stuck_bz'|null, days: number|null, corridor: 'ok'|'warn'|'stuck'|null, reason: string|null }}
 */
export function evaluateBagFlag(input) {
  const client = input.client ?? {}
  const today = String(input.todayIso ?? todayLocalIso()).slice(0, 10)
  if (client.archived_at) {
    return { stuck: false, kind: null, days: null, corridor: null, reason: null }
  }

  const lifecycle = String(client.lifecycle ?? '')
  const stage = String(client.pnk_stage ?? '')
  const pnkClosed = stage === 'lost' || lifecycle === 'pnk_lost'
  const pnkWon = stage === 'won'

  const days = daysWithoutUsableMembership(input.memList, today, input.lastCompletedIso)
  if (days == null) {
    return { stuck: false, kind: null, days: null, corridor: null, reason: null }
  }

  const types = input.membershipTypes ?? []
  const bzTypeIds = new Set(
    types.filter((t) => isPnkTrialTypeRow(t)).map((t) => String(t.id)),
  )
  const hadBz = (input.memList ?? []).some((m) => bzTypeIds.has(String(m.membership_type_id ?? '')))
  const hadPaid = (input.memList ?? []).some((m) => {
    const tid = String(m.membership_type_id ?? '')
    return tid && !bzTypeIds.has(tid)
  })
  const afterBz =
    (lifecycle === 'pnk' || hadBz) &&
    !pnkWon &&
    !pnkClosed &&
    !hadPaid

  let corridor = 'ok'
  if (days > COACH_QUALITY_STUCK_DAYS) corridor = 'stuck'
  else if (days > COACH_QUALITY_INACTIVE_GRACE_DAYS) corridor = 'warn'
  else corridor = 'ok'

  if (corridor === 'ok') {
    return {
      stuck: false,
      kind: null,
      days,
      corridor,
      reason: days > 0 ? `Неактивный ${days} дн. (коридор продления)` : null,
    }
  }

  if (corridor === 'warn') {
    return {
      stuck: false,
      kind: afterBz ? 'stuck_bz' : 'stuck_dk',
      days,
      corridor,
      reason: afterBz
        ? `После БЗ без ДК/отказа/архива ${days} дн.`
        : `В «Неактивных» ${days} дн. без нового абонемента и архива`,
    }
  }

  return {
    stuck: true,
    kind: afterBz ? 'stuck_bz' : 'stuck_dk',
    days,
    corridor,
    reason: afterBz
      ? `Хвост после БЗ ${days} дн.: нужен ДК, отказ или архив`
      : `Застрял в «Неактивных» ${days} дн.: нужен новый абонемент или архив`,
  }
}

/**
 * @param {{
 *   carePct: number|null,
 *   depthPct: number|null,
 *   stuckCount: number,
 *   completed: number,
 *   activeClients: number,
 *   insufficientCareDepth?: boolean,
 * }} p
 * @returns {{ status: CoachQualityStatus, failureDirections: CoachQualityAxis[], statusLabel: string }}
 */
export function resolveCoachQualityStatus(p) {
  const stuckCount = Math.max(0, Number(p.stuckCount) || 0)
  const bagWarnCount = Math.max(0, Number(p.bagWarnCount) || 0)
  const completed = Math.max(0, Number(p.completed) || 0)
  const activeClients = Math.max(0, Number(p.activeClients) || 0)
  const insufficient =
    p.insufficientCareDepth === true ||
    completed < COACH_QUALITY_MIN_COMPLETED ||
    activeClients < COACH_QUALITY_MIN_ACTIVE_CLIENTS

  const carePct = p.carePct
  const depthPct = p.depthPct
  const careBad = !insufficient && carePct != null && carePct < COACH_QUALITY_CARE_WARN
  const careWeak = !insufficient && carePct != null && carePct < COACH_QUALITY_CARE_OK
  const depthBad = !insufficient && depthPct != null && depthPct < COACH_QUALITY_DEPTH_BAD
  const depthWeak = !insufficient && depthPct != null && depthPct < COACH_QUALITY_DEPTH_OK

  /** @type {CoachQualityAxis[]} */
  const failureDirections = []
  if (stuckCount >= 1 || bagWarnCount >= 1) failureDirections.push('bag')
  if (careBad || careWeak) failureDirections.push('care')
  if (depthBad || depthWeak) failureDirections.push('depth')

  if (insufficient && stuckCount < 1) {
    return {
      status: 'insufficient_data',
      failureDirections: bagWarnCount >= 1 ? ['bag'] : [],
      statusLabel: 'Мало данных',
    }
  }

  if (careBad || stuckCount >= 1 || (careWeak && depthBad)) {
    return {
      status: 'review',
      failureDirections: [...new Set(failureDirections)],
      statusLabel: 'Разбор',
    }
  }

  if (careWeak || depthWeak || bagWarnCount >= 1) {
    return {
      status: 'attention',
      failureDirections: [...new Set(failureDirections)],
      statusLabel: 'Внимание',
    }
  }

  return {
    status: 'ok',
    failureDirections: [],
    statusLabel: 'Ок',
  }
}

/**
 * Итоговый балл 0–100 (веса осей из конфига клуба, дефолт 40/40/20).
 * Без завершённых тренировок в периоде — null (не рисуем «100 из воздуха»).
 * При stuck — потолок 79 (если тумблер включён).
 * @param {{
 *   carePct?: number|null,
 *   depthPct?: number|null,
 *   bagPct?: number|null,
 *   stuckCount?: number,
 *   completed?: number,
 * }} p
 * @param {import('./coachQualityConfigCore.js').CoachQualityConfig | object | null} [config]
 * @returns {number|null}
 */
export function computeCoachQualityScorePct(p = {}, config = null) {
  const completed = Math.max(0, Number(p.completed) || 0)
  if (completed <= 0) return null

  const cfg = normalizeCoachQualityConfig(config)

  const bag = Number.isFinite(Number(p.bagPct)) ? Number(p.bagPct) : 100
  const careRaw = p.carePct
  const depthRaw = p.depthPct
  const hasCare = careRaw != null && careRaw !== '' && Number.isFinite(Number(careRaw))
  const hasDepth = depthRaw != null && depthRaw !== '' && Number.isFinite(Number(depthRaw))

  const wCare = cfg.weightCare / 100
  const wDepth = cfg.weightDepth / 100
  const wBag = cfg.weightBag / 100

  let score
  if (hasCare && hasDepth) {
    score = Math.round(Number(careRaw) * wCare + Number(depthRaw) * wDepth + bag * wBag)
  } else if (hasCare || hasDepth) {
    /** @type {{ v: number, w: number }[]} */
    const parts = [{ v: bag, w: wBag }]
    if (hasCare) parts.push({ v: Number(careRaw), w: wCare })
    if (hasDepth) parts.push({ v: Number(depthRaw), w: wDepth })
    const wSum = parts.reduce((s, x) => s + x.w, 0)
    score =
      wSum > 0
        ? Math.round(parts.reduce((s, x) => s + x.v * x.w, 0) / wSum)
        : Math.round(parts.reduce((s, x) => s + x.v, 0) / parts.length)
  } else {
    score = Math.min(Math.round(bag), 70)
  }
  if (cfg.toggleStuckScoreCap && (Number(p.stuckCount) || 0) >= 1) {
    score = Math.min(score, 79)
  }
  if (score < 0) return 0
  if (score > 100) return 100
  return score
}

export const COACH_QUALITY_AXIS_LABELS = {
  care: 'Ведение клиентов',
  depth: 'Глубина тренировок',
  bag: 'Хвосты в «Неактивных»',
}

export const COACH_QUALITY_STATUS_LABELS = {
  ok: 'Ок',
  attention: 'Внимание',
  review: 'Разбор',
  insufficient_data: 'Мало данных',
}

/**
 * Короткие правила для UI (тренер и админ видят одно и то же).
 * @param {import('./coachQualityConfigCore.js').CoachQualityConfig | object | null} [config]
 */
export function coachQualityRulesHelp(config = null) {
  return coachQualityRulesHelpFromConfig(config)
}
