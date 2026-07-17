/**
 * Итог качества ведения ПНК (чеклист для админа).
 * Отличает «сделано по делу» от «только отметка / пропуск».
 * Без React / IDB.
 */

import { isHealthCardComplete } from '../healthCardCore.js'
import { parsePnkDeliverables, PNK_DELIVERABLE_LABELS } from './pnkStagesCore.js'
import { normalizePnkTrialSessions } from './pnkWizardCore.js'

/**
 * @typedef {'done' | 'weak' | 'missing'} PnkQualityStatus
 * @typedef {{ key: string, label: string, status: PnkQualityStatus, note: string }} PnkQualityItem
 */

/**
 * Показывать блок итога визита (админ): открытый ПНК, отказ или оформленный.
 * @param {object | null | undefined} client
 */
export function shouldShowPnkVisitQuality(client) {
  if (!client) return false
  const lc = String(client.lifecycle ?? '')
  if (lc === 'pnk' || lc === 'pnk_lost') return true
  if (client.pnk_won_at || client.pnk_created_at) return true
  if (client.pnk_stage != null && String(client.pnk_stage) !== '') return true
  return false
}

/**
 * @param {object} client
 * @param {{
 *   healthCard?: object | null,
 *   bzCompletedCount?: number,
 *   hasMeasurements?: boolean,
 *   hasNutritionPlan?: boolean,
 * }} [ctx]
 */
export function buildPnkVisitQualityReport(client, ctx = {}) {
  const d = parsePnkDeliverables(client?.pnk_deliverables)
  const sessions = normalizePnkTrialSessions(client?.pnk_trial_sessions)
  const healthOk = isHealthCardComplete(ctx.healthCard)
  const hasPlan =
    ctx.hasNutritionPlan === true ||
    (() => {
      const plan = ctx.healthCard?.nutrition_plan
      if (plan == null || plan === '') return false
      if (typeof plan === 'object') return Object.keys(plan).length > 0
      return String(plan).trim().length > 2
    })()
  const bzDone = Math.max(0, Number(ctx.bzCompletedCount) || 0)
  const hasMeasure = ctx.hasMeasurements === true

  /** @type {PnkQualityItem[]} */
  const items = []

  items.push(itemContact(d))
  items.push(itemVisit(d))
  items.push(itemHealth(d, healthOk))
  items.push(itemNutrition(d, hasPlan))
  items.push(itemTrial(d, bzDone, 1, sessions === 2 ? 'Тренировка 1' : 'Бесплатная тренировка'))
  items.push(itemHomework(d, 'homework', sessions === 2 ? 'ДЗ после 1-й' : 'Домашнее задание'))
  if (sessions === 2) {
    items.push(itemTrial(d, bzDone, 2, 'Тренировка 2'))
    items.push(itemHomework(d, 'homework2', 'ДЗ после 2-й'))
  }
  items.push(itemFollowup(d))
  items.push(itemMeasurements(hasMeasure))
  items.push(itemOutcome(client))

  const counted = items.filter((i) => i.key !== 'outcome')
  const done = counted.filter((i) => i.status === 'done').length
  const weak = counted.filter((i) => i.status === 'weak').length
  const missing = counted.filter((i) => i.status === 'missing').length
  const total = counted.length
  const pct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0

  return {
    items,
    done,
    weak,
    missing,
    total,
    pct,
    summaryLine: buildSummaryLine({ done, weak, missing, total, client }),
  }
}

function itemContact(d) {
  if (d.contact) return row('contact', PNK_DELIVERABLE_LABELS.contact || 'Контакт', 'done', 'Связь с клиентом отмечена')
  return row('contact', 'Контакт', 'missing', 'Нет отметки контакта')
}

function itemVisit(d) {
  if (d.visit_started) return row('visit_started', 'Визит начат', 'done', 'Клиент пришёл')
  return row('visit_started', 'Визит начат', 'missing', 'Пакет визита не стартовал')
}

function itemHealth(d, healthOk) {
  if (healthOk) return row('health', 'Здоровье', 'done', 'Карта заполнена')
  if (d.health) return row('health', 'Здоровье', 'weak', 'Отмечено в воронке, карта неполная')
  return row('health', 'Здоровье', 'missing', 'Карта не заполнена')
}

function itemNutrition(d, hasPlan) {
  if (hasPlan) return row('nutrition', 'Питание', 'done', 'Рацион сохранён')
  if (d.nutrition) return row('nutrition', 'Питание', 'weak', 'Отмечено без рациона (возможен пропуск)')
  return row('nutrition', 'Питание', 'missing', 'Рацион не делали')
}

function itemTrial(d, bzDone, need, label) {
  const key = need === 2 ? 'trial2' : 'trial'
  const marked = Boolean(d[key])
  const real = bzDone >= need
  if (real) return row(key, label, 'done', 'Тренировка проведена')
  if (marked) return row(key, label, 'weak', 'Отметка есть, завершённых БЗ меньше нужного')
  return row(key, label, 'missing', 'Тренировка не проведена')
}

function itemHomework(d, key, label) {
  if (d[key]) return row(key, label, 'done', 'ДЗ отмечено')
  return row(key, label, 'missing', 'ДЗ не выдано')
}

function itemFollowup(d) {
  if (d.followup) return row('followup', 'Контакт после', 'done', 'Касание после бесплатной')
  return row('followup', 'Контакт после', 'missing', 'Нет касания после')
}

function itemMeasurements(hasMeasure) {
  if (hasMeasure) return row('measurements', 'Обмеры', 'done', 'Есть замеры')
  return row('measurements', 'Обмеры', 'missing', 'Обмеров нет')
}

function itemOutcome(client) {
  const stage = String(client?.pnk_stage ?? '')
  const lc = String(client?.lifecycle ?? '')
  if (stage === 'won' || lc === 'active') {
    return row('outcome', 'Итог', 'done', 'Оформлен (ДК)')
  }
  if (stage === 'lost' || lc === 'pnk_lost') {
    return row('outcome', 'Итог', 'weak', 'Отказ')
  }
  return row('outcome', 'Итог', 'missing', 'Ещё в воронке')
}

function row(key, label, status, note) {
  return { key, label, status, note }
}

function buildSummaryLine({ done, weak, missing, total, client }) {
  const stage = String(client?.pnk_stage ?? '')
  const head =
    stage === 'won'
      ? 'Оформление'
      : stage === 'lost'
        ? 'Отказ'
        : 'В работе'
  if (missing === 0 && weak === 0) return `${head}: пакет полный (${done}/${total})`
  if (weak > 0 && missing === 0) return `${head}: есть слабые места (${weak}), сделано ${done}/${total}`
  return `${head}: сделано ${done}/${total}, слабо ${weak}, нет ${missing}`
}

/**
 * Дробь оформлений и % для KPI.
 * @param {number} entered
 * @param {number} won
 */
export function formatPnkConversionFraction(entered, won) {
  const e = Math.max(0, Math.floor(Number(entered) || 0))
  const w = Math.max(0, Math.floor(Number(won) || 0))
  const pct = e > 0 ? Math.round((w / e) * 1000) / 10 : 0
  return {
    entered: e,
    won: w,
    fraction: `${w}/${e}`,
    pct,
    pctLabel: `${pct}%`,
  }
}
