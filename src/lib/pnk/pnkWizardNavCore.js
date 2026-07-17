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
  // «Создан» не показываем как рабочий шаг — прыгаем к invite минимум
  let prev = idx - 1
  while (prev > 0 && step.steps[prev]?.key === 'created') prev -= 1
  const row = step.steps[prev]
  if (!row || row.key === 'created') return { prevKey: null, prevTitle: null }
  return { prevKey: row.key, prevTitle: row.title }
}

/**
 * Какой deliverable снять, чтобы вернуться на предыдущий шаг.
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @returns {{ clear_deliverable: string } | null}
 */
export function buildPnkWizardBackClearPatch(step) {
  if (!step?.key) return null
  /** @type {Record<string, string>} */
  const map = {
    wait: 'contact',
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
 * Рискованные шаги (снимают отметку тренировки / ДЗ после зала) — только серая кнопка.
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
 * Откат снимет отметку зала / ДЗ — кнопку оставляем серой.
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 */
export function isPnkWizardBackRisky(step) {
  const key = step?.key
  return key === 'hw1' || key === 'hw2' || key === 'train2' || key === 'followup' || key === 'close'
}

/**
 * Шаги, которые можно пропустить без полного действия в форме.
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 */
export function canSkipPnkWizardStep(step) {
  if (!step?.key) return { ok: false, reason: 'Нет шага' }
  switch (step.key) {
    case 'nutrition':
      return { ok: true, reason: null }
    case 'hw1':
    case 'hw2':
      return { ok: true, reason: null }
    case 'followup':
      return { ok: true, reason: null }
    case 'health':
      return { ok: false, reason: 'Карту здоровья пропустить нельзя' }
    case 'train1':
    case 'train2':
      return { ok: false, reason: 'Тренировку пропустить нельзя' }
    case 'invite':
      return { ok: false, reason: 'Сначала сохраните дату' }
    case 'wait':
      return { ok: false, reason: 'Нажмите «Далее», когда клиент пришёл' }
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
 * Патч для универсальной «Далее» в шапке (в т.ч. wait → визит, invite → дата).
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @param {{ trialDate?: string, trialTime?: string }} [opts]
 */
export function buildPnkWizardHatNextPatch(step, opts = {}) {
  if (!step?.key) return null
  if (step.key === 'wait') return buildPnkVisitStartedPatch()
  if (step.key === 'invite') {
    const trialDate = String(opts.trialDate ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trialDate)) return null
    return {
      stage: 'agreed',
      trial_date: trialDate,
      trial_time: String(opts.trialTime ?? '').trim() || null,
      deliverable: 'contact',
    }
  }
  return buildPnkWizardAdvancePatch(step)
}

/**
 * Можно ли жать «Далее» в шапке.
 * @param {object} client
 * @param {ReturnType<typeof import('./pnkWizardCore.js').resolvePnkWizardStep>} step
 * @param {{ healthCard?: object | null, bzCompletedCount?: number, trialDate?: string, trialTime?: string }} [ctx]
 */
export function canHatNextPnkWizardStep(client, step, ctx = {}) {
  if (!step) return { ok: false, reason: 'Нет шага' }
  if (step.key === 'close') return { ok: false, reason: 'Выберите оформление или отказ' }
  if (step.key === 'wait') return { ok: true, reason: null, label: 'Клиент пришёл' }
  if (step.key === 'invite') {
    const trialDate = String(ctx.trialDate ?? client?.pnk_trial_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trialDate)) {
      return { ok: false, reason: 'Укажите дату бесплатной', label: 'Далее' }
    }
    return { ok: true, reason: null, label: 'Далее' }
  }
  const adv = canAdvancePnkWizardStep(client, step, ctx)
  return { ...adv, label: 'Далее' }
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
  }
}

/**
 * Подписи сегментов для компактной шапки / плитки (короткие).
 * @param {1|2|number} sessions
 */
export function buildPnkFunnelSegmentLabels(sessions) {
  return buildPnkWizardStepList(sessions)
    .filter((s) => s.key !== 'created')
    .map((s) => ({ key: s.key, label: s.title }))
}
