/** Визуализация прогресса плана продаж для анимированной полоски. */

import { PLAN_LEVEL_LABELS, planProgressPercent } from './salesReportCore.js'

/**
 * @param {number} progressPercent — может быть > 100
 * @returns {{ fillPercent: number, overflow: boolean, overflowPercent: number }}
 */
export function buildPlanProgressVisual(progressPercent) {
  const pct = Number(progressPercent) || 0
  const fillPercent = Math.min(100, Math.max(0, pct))
  const overflow = pct > 100
  const overflowPercent = overflow ? Math.round((pct - 100) * 10) / 10 : 0

  return { fillPercent, overflow, overflowPercent }
}

/**
 * Три порога на одной шкале: уровень 3 — финал (100% шкалы).
 * @param {number} fact
 * @param {{ level1?: number, level2?: number, level3?: number }} levels
 */
export function buildPlanMilestoneVisual(fact, levels) {
  const amounts = [
    Number(levels?.level1) || 0,
    Number(levels?.level2) || 0,
    Number(levels?.level3) || 0,
  ]
  const positive = amounts.filter((n) => n > 0)
  if (!positive.length) {
    return {
      scaleMax: 0,
      finalTarget: 0,
      fillPercent: 0,
      milestones: [],
      achievedLevel: 0,
      progressPercent: 0,
      overflow: false,
      overflowPercent: 0,
    }
  }

  const finalTarget = amounts[2] > 0 ? amounts[2] : Math.max(...positive)
  const scaleMax = finalTarget
  const f = Number(fact) || 0
  const progressPercent = planProgressPercent(f, scaleMax)
  const bar = buildPlanProgressVisual(progressPercent)

  let achievedLevel = 0
  const milestones = amounts
    .map((amount, idx) => {
      if (amount <= 0) return null
      if (f >= amount - 0.009) achievedLevel = idx + 1
      return {
        key: String(idx + 1),
        label: PLAN_LEVEL_LABELS[idx] ?? `Уровень ${idx + 1}`,
        amount,
        leftPercent: scaleMax > 0 ? Math.min(100, Math.max(0, (amount / scaleMax) * 100)) : 0,
        reached: f >= amount - 0.009,
        isFinal: idx === 2,
      }
    })
    .filter(Boolean)

  return {
    scaleMax,
    finalTarget,
    fillPercent: bar.fillPercent,
    milestones,
    achievedLevel,
    progressPercent,
    overflow: bar.overflow,
    overflowPercent: bar.overflowPercent,
  }
}
