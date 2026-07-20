/**
 * Итог качества ведения ПНК (чеклист для админа).
 * Отличает «сделано по делу» от «только отметка / пропуск».
 * Блок «В зале» = пакет первой бесплатной: пока нет начала тренировки,
 * остальные пункты зала/после не штрафуют оценку (status pending).
 * Без React / IDB.
 */

import { formatDateRu } from '../dateRu.js'
import { isHealthCardComplete } from '../healthCardCore.js'
import { parsePnkDeliverables, PNK_DELIVERABLE_LABELS } from './pnkStagesCore.js'
import { normalizePnkTrialSessions } from './pnkWizardCore.js'

/**
 * @typedef {'done' | 'weak' | 'missing' | 'pending'} PnkQualityStatus
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

/** Пункты пакета визита (кроме самого «начала»), которые рано штрафовать до входа в зал */
const VISIT_PACKAGE_KEYS = new Set([
  'health',
  'nutrition',
  'trial',
  'homework',
  'trial2',
  'homework2',
])

const AFTER_KEYS = new Set(['followup'])

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
  const visitStarted = Boolean(d.visit_started)

  /** @type {PnkQualityItem[]} */
  const items = []

  items.push(withPhase(itemContact(d), 'before'))
  items.push(withPhase(itemDate(client), 'before'))
  items.push(withPhase(itemVisitStart(d, client), 'visit'))
  items.push(
    withPhase(gateUntilVisit(itemHealthAndMeasures(d, healthOk, ctx.hasMeasurements), visitStarted), 'visit'),
  )
  items.push(withPhase(gateUntilVisit(itemNutrition(d, hasPlan), visitStarted), 'visit'))
  items.push(
    withPhase(
      gateUntilVisit(
        itemTrial(d, bzDone, 1, sessions === 2 ? 'Тренировка 1' : 'Тренировка', client),
        visitStarted,
      ),
      'visit',
    ),
  )
  items.push(
    withPhase(
      gateUntilVisit(
        itemHomework(d, 'homework', sessions === 2 ? 'ДЗ после 1-й' : 'Домашнее задание'),
        visitStarted,
      ),
      'visit',
    ),
  )
  if (sessions === 2) {
    items.push(
      withPhase(
        gateUntilVisit(itemTrial(d, bzDone, 2, 'Тренировка 2', client), visitStarted),
        'visit',
      ),
    )
    items.push(
      withPhase(gateUntilVisit(itemHomework(d, 'homework2', 'ДЗ после 2-й'), visitStarted), 'visit'),
    )
  }
  items.push(withPhase(gateUntilVisit(itemFollowup(d), visitStarted), 'after'))
  items.push(withPhase(itemOutcome(client), 'after'))

  // outcome не в чипах; pending не штрафует (ещё нельзя требовать)
  const counted = items.filter((i) => i.key !== 'outcome' && i.status !== 'pending')
  const done = counted.filter((i) => i.status === 'done').length
  const weak = counted.filter((i) => i.status === 'weak').length
  const missing = counted.filter((i) => i.status === 'missing').length
  const pending = items.filter((i) => i.status === 'pending').length
  const total = counted.length
  const pct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0

  return {
    items,
    phases: groupVisitQualityPhases(items),
    done,
    weak,
    missing,
    pending,
    total,
    pct,
    visitStarted,
    summaryLine: buildSummaryLine({ done, weak, missing, total, pending, client }),
  }
}

/**
 * До начала тренировки в зале пакет «В зале»/«После» не штрафуем.
 * Уже сделанное по делу оставляем (редко, но честно).
 * @param {{ key: string, label: string, status: PnkQualityStatus, note: string }} item
 * @param {boolean} visitStarted
 */
function gateUntilVisit(item, visitStarted) {
  if (visitStarted) return item
  if (item.status === 'done') return item
  const inPackage = VISIT_PACKAGE_KEYS.has(item.key) || AFTER_KEYS.has(item.key)
  if (!inPackage) return item
  return {
    ...item,
    status: 'pending',
    note: 'После начала тренировки в зале',
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

/** Старт пакета первой бесплатной в зале */
function itemVisitStart(d, client) {
  const when = formatPnkTrialSlot(client)
  const label = PNK_DELIVERABLE_LABELS.visit_started
  if (d.visit_started) {
    return row('visit_started', label, 'done', when ? `Начата · ${when}` : 'Клиент в зале')
  }
  if (when) {
    return row('visit_started', label, 'missing', `Ждём в зале · бесплатная ${when}`)
  }
  return row('visit_started', label, 'missing', 'Ещё не началась · нет даты бесплатной')
}

/**
 * Один пункт визита: карта здоровья + обмеры (на вкладке «Здоровье» они уже рядом).
 * key остаётся `health` — deliverable воронки тот же.
 * hasMeasurements === undefined — обмеры не подгружали (доска без IDB): оцениваем только карту.
 */
function itemHealthAndMeasures(d, healthOk, hasMeasurements) {
  const label = 'Здоровье и обмеры'
  const measuresKnown = typeof hasMeasurements === 'boolean'
  const measuresOk = hasMeasurements === true

  if (healthOk && (!measuresKnown || measuresOk)) {
    if (measuresOk) return row('health', label, 'done', 'Карта и обмеры есть')
    return row('health', label, 'done', 'Карта заполнена')
  }
  if (healthOk && measuresKnown && !measuresOk) {
    return row('health', label, 'weak', 'Карта есть, обмеров нет')
  }
  if (!healthOk && measuresOk) {
    return row('health', label, 'weak', 'Обмеры есть, карта неполная')
  }
  if (d.health) {
    return row('health', label, 'weak', 'Отмечено в воронке, карта неполная')
  }
  return row('health', label, 'missing', 'Нет карты здоровья и обмеров')
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

function buildSummaryLine({ done, weak, missing, total, pending, client }) {
  const stage = String(client?.pnk_stage ?? '')
  const head =
    stage === 'won' ? 'Оформление' : stage === 'lost' ? 'Отказ' : 'В работе'
  if (pending > 0 && missing === 0 && weak === 0 && done === total) {
    return `${head}: по текущему этапу ок (${done}/${total}), ждём зал`
  }
  if (missing === 0 && weak === 0) return `${head}: пакет полный (${done}/${total})`
  if (weak > 0 && missing === 0) return `${head}: частично (${weak}), сделано ${done}/${total}`
  return `${head}: сделано ${done}/${total}, частично ${weak}, нет ${missing}`
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
