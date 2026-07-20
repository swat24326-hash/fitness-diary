/**
 * Навигация шапки воронки ПНК: Назад / Далее / Пропустить.
 * Без React / IDB.
 */

import {
  buildPnkVisitStartedPatch,
  buildPnkWizardAdvancePatch,
  buildPnkWizardStepList,
  canAdvancePnkWizardStep,
  normalizePnkTrialSessions,
} from './pnkWizardCore.js'

/** @typedef {import('./pnkWizardCore.js').PnkWizardKey} PnkWizardKey */

/**
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @returns {{ prevKey: PnkWizardKey | null, prevTitle: string | null }}
 */
export function resolvePnkWizardBackTarget(step) {
  if (!step?.steps?.length || !step.key) return { prevKey: null, prevTitle: null }
  const idx = step.steps.findIndex((s) => s.key === step.key)
  if (idx <= 0) return { prevKey: null, prevTitle: null }
  // «Создан ПНК» не показываем как рабочий шаг — минимум «Связь с клиентом»
  let prev = idx - 1
  while (prev > 0 && step.steps[prev]?.key === 'created') prev -= 1
  const row = step.steps[prev]
  if (!row || row.key === 'created') return { prevKey: null, prevTitle: null }
  return { prevKey: row.key, prevTitle: row.title }
}

/**
 * Патч отката на предыдущий шаг.
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @returns {{ clear_deliverable?: string, trial_date?: string, trial_time?: string, stage?: string } | null}
 */
export function buildPnkWizardBackClearPatch(step) {
  if (!step?.key) return null
  if (step.key === 'date') {
    return { clear_deliverable: 'contact', stage: 'assigned' }
  }
  if (step.key === 'wait') {
    return { trial_date: '', trial_time: '', stage: 'contact' }
  }
  /** @type {Record<string, string>} */
  const map = {
    health: 'visit_started',
    nutrition: 'health',
    train1: 'nutrition',
    hw1: 'trial',
    train2: 'homework',
    hw2: 'trial2',
    followup: normalizePnkTrialSessions(step.sessions) === 2 ? 'homework2' : 'homework',
    close: 'followup',
  }
  const key = map[step.key]
  return key ? { clear_deliverable: key } : null
}

/**
 * Можно ли «Назад» с очисткой отметки.
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 */
export function canGoBackPnkWizardStep(step) {
  const patch = buildPnkWizardBackClearPatch(step)
  if (!patch) return { ok: false, reason: 'Это первый шаг', risky: false }
  if (isPnkWizardBackRisky(step)) {
    return {
      ok: false,
      reason: 'Назад здесь снимет отметку тренировки или ДЗ — лучше не откатывать',
      risky: true,
    }
  }
  return { ok: true, patch, risky: false }
}

/**
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 */
export function isPnkWizardBackRisky(step) {
  const key = step?.key
  return key === 'hw1' || key === 'hw2' || key === 'train2' || key === 'followup' || key === 'close'
}

/**
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 */
export function canSkipPnkWizardStep(step) {
  if (!step?.key) return { ok: false, reason: 'Нет шага' }
  switch (step.key) {
    case 'nutrition':
    case 'hw1':
    case 'hw2':
    case 'followup':
      return { ok: true, reason: null }
    case 'health':
      return { ok: false, reason: 'Карту здоровья пропустить нельзя' }
    case 'train1':
    case 'train2':
      return { ok: false, reason: 'Тренировку пропустить нельзя' }
    case 'contact':
      return { ok: false, reason: 'Сначала свяжитесь с клиентом' }
    case 'date':
      return { ok: false, reason: 'Сначала сохраните дату' }
    case 'wait':
      return { ok: false, reason: 'Нажмите «Клиент пришёл», когда клиент в зале' }
    case 'close':
      return { ok: false, reason: 'Выберите оформление или отказ' }
    default:
      return { ok: false, reason: 'Этот шаг нельзя пропустить' }
  }
}

/**
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 */
export function buildPnkWizardSkipPatch(step) {
  if (!canSkipPnkWizardStep(step).ok) return null
  return buildPnkWizardAdvancePatch(step)
}

/**
 * Патч для «Далее» в шапке.
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @param {{ trialDate?: string, trialTime?: string }} [opts]
 */
export function buildPnkWizardHatNextPatch(step, opts = {}) {
  if (!step?.key) return null
  if (step.key === 'wait') return buildPnkVisitStartedPatch()
  if (step.key === 'contact') {
    return { stage: 'contact', deliverable: 'contact' }
  }
  if (step.key === 'date') {
    const trialDate = String(opts.trialDate ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trialDate)) return null
    return {
      stage: 'agreed',
      trial_date: trialDate,
      trial_time: String(opts.trialTime ?? '').trim() || null,
    }
  }
  return buildPnkWizardAdvancePatch(step)
}

/**
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @param {{ canNext?: boolean }} [opts]
 * @returns {'hat' | 'body'}
 */
export function resolvePnkStepPrimarySlot(step, opts = {}) {
  const key = step?.key
  if ((key === 'train1' || key === 'train2') && opts.canNext !== true) return 'body'
  return 'hat'
}

/**
 * @param {object} client
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @param {{ healthCard?: object | null, bzCompletedCount?: number, trialDate?: string, trialTime?: string }} [ctx]
 */
export function canHatNextPnkWizardStep(client, step, ctx = {}) {
  if (!step) return { ok: false, reason: 'Нет шага' }
  if (step.key === 'close') return { ok: false, reason: 'Выберите оформление или отказ' }
  if (step.key === 'wait') return { ok: true, reason: null, label: 'Клиент пришёл' }
  if (step.key === 'contact') {
    return { ok: true, reason: null, label: 'Связался — далее' }
  }
  if (step.key === 'date') {
    const trialDate = String(ctx.trialDate ?? client?.pnk_trial_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trialDate)) {
      return { ok: false, reason: 'Укажите дату бесплатной', label: 'Далее' }
    }
    return { ok: true, reason: null, label: 'Сохранить дату' }
  }
  const adv = canAdvancePnkWizardStep(client, step, ctx)
  /** @type {Record<string, string>} */
  const labels = {
    health: 'К питанию',
    nutrition: 'К тренировке',
    train1: 'Далее',
    train2: 'Далее',
    hw1: 'Далее',
    hw2: 'Далее',
    followup: 'Далее',
  }
  return { ...adv, label: labels[step.key] || 'Далее' }
}

/**
 * Сводка кнопок шапки.
 * @param {object} client
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @param {{ healthCard?: object | null, bzCompletedCount?: number, trialDate?: string, trialTime?: string }} [ctx]
 */
export function resolvePnkFunnelHatNav(client, step, ctx = {}) {
  const back = canGoBackPnkWizardStep(step)
  const next = canHatNextPnkWizardStep(client, step, ctx)
  const skip = canSkipPnkWizardStep(step)
  const backTarget = resolvePnkWizardBackTarget(step)
  const primarySlot = resolvePnkStepPrimarySlot(step, { canNext: next.ok })
  return {
    canBack: back.ok,
    backReason: back.ok ? null : back.reason,
    backRisky: back.risky === true,
    backPatch: back.patch ?? null,
    backTitle: backTarget.prevTitle,
    canNext: next.ok,
    nextReason: next.ok ? null : next.reason,
    nextLabel: next.label || 'Далее',
    nextPatch: next.ok ? buildPnkWizardHatNextPatch(step, ctx) : null,
    canSkip: skip.ok,
    skipReason: skip.ok ? null : skip.reason,
    skipPatch: skip.ok ? buildPnkWizardSkipPatch(step) : null,
    primarySlot,
  }
}

/**
 * @param {1|2|number} sessions
 */
export function buildPnkFunnelSegmentLabels(sessions) {
  return buildPnkWizardStepList(sessions)
    .filter((s) => s.key !== 'created')
    .map((s) => ({ key: s.key, label: s.title }))
}
