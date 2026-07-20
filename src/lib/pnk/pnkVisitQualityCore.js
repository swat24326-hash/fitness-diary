/**
 * Итог качества ведения ПНК (чеклист для админа).
 * Отличает «сделано по делу» от «только отметка / пропуск».
 * Без React / IDB.
 */

import { formatDateRu } from '../dateRu.js'
import { isHealthCardComplete } from '../healthCardCore.js'
import { parsePnkDeliverables, PNK_DELIVERABLE_LABELS } from './pnkStagesCore.js'
import { normalizePnkTrialSessions } from './pnkWizardCore.js'

/**
 * @typedef {'done' | 'weak' | 'missing'} PnkQualityStatus
 * @typedef {'before' | 'visit' | 'after'} PnkQualityPhase
 * @typedef {{
 *   key: string,
 *   label: string,
 *   status: PnkQualityStatus,
 *   note: string,
 *   phase: PnkQualityPhase,
 *   phaseLabel: string,
 * }} PnkQualityItem
 */

export const PNK_VISIT_QUALITY_PHASES = [
  { id: 'before', label: 'До визита' },
  { id: 'visit', label: 'В зале' },
  { id: 'after', label: 'После' },
]

/**
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

  items.push(withPhase(itemContact(d), 'before'))
  items.push(withPhase(itemDate(client), 'before'))
  items.push(withPhase(itemVisit(d), 'visit'))
  items.push(withPhase(itemHealth(d, healthOk), 'visit'))
  items.push(withPhase(itemNutrition(d, hasPlan), 'visit'))
  items.push(
    withPhase(
      itemTrial(d, bzDone, 1, sessions === 2 ? 'Тренировка 1' : 'Тренировка', client),
      'visit',
    ),
  )
  items.push(
    withPhase(
      itemHomework(d, 'homework', sessions === 2 ? 'ДЗ после 1-й' : 'Домашнее задание'),
      'visit',
    ),
  )
  if (sessions === 2) {
    items.push(withPhase(itemTrial(d, bzDone, 2, 'Тренировка 2', client), 'visit'))
    items.push(withPhase(itemHomework(d, 'homework2', 'ДЗ после 2-й'), 'visit'))
  }
  items.push(withPhase(itemFollowup(d), 'after'))
  items.push(withPhase(itemMeasurements(hasMeasure), 'after'))
  items.push(withPhase(itemOutcome(client), 'after'))

  const counted = items.filter((i) => i.key !== 'outcome')
  const done = counted.filter((i) => i.status === 'done').length
  const weak = counted.filter((i) => i.status === 'weak').length
  const missing = counted.filter((i) => i.status === 'missing').length
  const total = counted.length
  const pct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0

  return {
    items,
    phases: groupVisitQualityPhases(items),
    done,
    weak,
    missing,
    total,
    pct,
    summaryLine: buildSummaryLine({ done, weak, missing, total, client }),
  }
}

/**
 * @param {PnkQualityItem[]} items
 */
export function groupVisitQualityPhases(items) {
  return PNK_VISIT_QUALITY_PHASES.map((p) => ({
    id: p.id,
    label: p.label,
    items: items.filter((i) => i.phase === p.id),
  })).filter((g) => g.items.length > 0)
}

function withPhase(item, phase) {
  const phaseLabel = PNK_VISIT_QUALITY_PHASES.find((p) => p.id === phase)?.label || ''
  return { ...item, phase, phaseLabel }
}

function itemContact(d) {
  if (d.contact) {
    return row('contact', PNK_DELIVERABLE_LABELS.contact, 'done', 'Связь отмечена')
  }
  return row('contact', PNK_DELIVERABLE_LABELS.contact, 'missing', 'Нет отметки связи')
}

function itemDate(client) {
  const when = formatPnkTrialSlot(client)
  if (when) return row('trial_date', 'Дата бесплатной', 'done', `Назначена на ${when}`)
  return row('trial_date', 'Дата бесплатной', 'missing', 'Дата не назначена')
}

function itemVisit(d) {
  if (d.visit_started) {
    return row('visit_started', PNK_DELIVERABLE_LABELS.visit_started, 'done', 'Клиент пришёл')
  }
  return row(
    'visit_started',
    PNK_DELIVERABLE_LABELS.visit_started,
    'missing',
    'Пакет визита не стартовал',
  )
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

function formatPnkTrialSlot(client) {
  const trialDate = String(client?.pnk_trial_date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trialDate)) return ''
  const trialTime = String(client?.pnk_trial_time ?? '')
    .trim()
    .slice(0, 5)
  return `${formatDateRu(trialDate)}${trialTime ? ` ${trialTime}` : ''}`
}

function itemTrial(d, bzDone, need, label, client) {
  const key = need === 2 ? 'trial2' : 'trial'
  const marked = Boolean(d[key])
  const real = bzDone >= need
  const when = need === 1 ? formatPnkTrialSlot(client) : ''
  if (real) {
    return row(key, label, 'done', when ? `Проведена · была на ${when}` : 'Тренировка проведена')
  }
  if (marked) {
    return row(
      key,
      label,
      'weak',
      when
        ? `Отметка есть · дата ${when}, завершённых БЗ меньше нужного`
        : 'Отметка есть, завершённых БЗ меньше нужного',
    )
  }
  if (when) {
    return row(key, label, 'weak', `Назначена на ${when} · ещё не проведена`)
  }
  return row(key, label, 'missing', 'Тренировка не проведена')
}

function itemHomework(d, key, label) {
  if (d[key]) return row(key, label, 'done', 'ДЗ отмечено')
  return row(key, label, 'missing', 'ДЗ не выдано')
}

function itemFollowup(d) {
  if (d.followup) {
    return row('followup', PNK_DELIVERABLE_LABELS.followup, 'done', 'Касание после бесплатной')
  }
  return row('followup', PNK_DELIVERABLE_LABELS.followup, 'missing', 'Нет касания после')
}

function itemMeasurements(hasMeasure) {
  if (hasMeasure) return row('measurements', 'Обмеры', 'done', 'Есть замеры')
  return row('measurements', 'Обмеры', 'missing', 'Обмеров нет')
}

function itemOutcome(client) {
  const stage = String(client?.pnk_stage ?? '')
  const lc = String(client?.lifecycle ?? '')
  if (stage === 'won' || lc === 'active') {
    return row('outcome', 'Оформление', 'done', 'Оформлен (ДК)')
  }
  if (stage === 'lost' || lc === 'pnk_lost') {
    return row('outcome', 'Оформление', 'weak', 'Отказ')
  }
  return row('outcome', 'Оформление', 'missing', 'Ещё в воронке')
}

function row(key, label, status, note) {
  return { key, label, status, note }
}

function buildSummaryLine({ done, weak, missing, total, client }) {
  const stage = String(client?.pnk_stage ?? '')
  const head =
    stage === 'won' ? 'Оформление' : stage === 'lost' ? 'Отказ' : 'В работе'
  if (missing === 0 && weak === 0) return `${head}: пакет полный (${done}/${total})`
  if (weak > 0 && missing === 0) return `${head}: есть слабые места (${weak}), сделано ${done}/${total}`
  return `${head}: сделано ${done}/${total}, слабо ${weak}, нет ${missing}`
}

/**
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
