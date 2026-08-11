/** Визуализация прогресса плана продаж для анимированной полоски. */

import { PLAN_LEVEL_LABELS, planProgressPercent } from './salesReportCore.js'

/** Мин. зазор между маркерами 1/2/3 на шкале (% ширины), чтобы кружки не наезжали. */
export const PLAN_MILESTONE_MIN_GAP_PERCENT = 8

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
 * Раздвигает позиции маркеров по шкале, если суммы планов слишком близки
 * (иначе 1/2/3 склеиваются у правого края).
 * Порядок и якорь справа (финал) сохраняются; точные ₽ — в amount / title.
 *
 * @param {number[]} leftPercents — истинные позиции 0…100, по возрастанию
 * @param {number} [minGapPercent]
 * @returns {number[]}
 */
export function spreadMilestoneLeftPercents(leftPercents, minGapPercent = PLAN_MILESTONE_MIN_GAP_PERCENT) {
  const gap = Math.max(0, Number(minGapPercent) || 0)
  const n = leftPercents?.length ?? 0
  if (n === 0) return []
  if (n === 1) {
    const only = Number(leftPercents[0])
    return [Number.isFinite(only) ? Math.min(100, Math.max(0, only)) : 0]
  }

  const pos = leftPercents.map((v) => {
    const x = Number(v)
    return Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 0
  })

  // Справа налево: не ближе gap к следующему (кластер у 100% → уезжают влево)
  for (let i = n - 2; i >= 0; i -= 1) {
    const maxAllowed = pos[i + 1] - gap
    if (pos[i] > maxAllowed) pos[i] = Math.max(0, maxAllowed)
  }

  // Слева направо: не ближе gap к предыдущему (без выталкивания финала за 100)
  for (let i = 1; i < n; i += 1) {
    const minAllowed = pos[i - 1] + gap
    if (pos[i] < minAllowed) {
      const room = i === n - 1 ? 100 : pos[i + 1] - gap
      pos[i] = Math.min(Math.max(pos[i], minAllowed), Math.max(minAllowed, room))
    }
  }

  // Финал держим у правого края шкалы, если он был близко к 100
  if (pos[n - 1] < 100 && leftPercents[n - 1] >= 99.5) {
    pos[n - 1] = 100
    for (let i = n - 2; i >= 0; i -= 1) {
      const maxAllowed = pos[i + 1] - gap
      if (pos[i] > maxAllowed) pos[i] = Math.max(0, maxAllowed)
    }
  }

  return pos.map((x) => Math.round(x * 100) / 100)
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
  const raw = amounts
    .map((amount, idx) => {
      if (amount <= 0) return null
      if (f >= amount - 0.009) achievedLevel = idx + 1
      const trueLeftPercent = scaleMax > 0 ? Math.min(100, Math.max(0, (amount / scaleMax) * 100)) : 0
      return {
        key: String(idx + 1),
        label: PLAN_LEVEL_LABELS[idx] ?? `Уровень ${idx + 1}`,
        amount,
        trueLeftPercent,
        leftPercent: trueLeftPercent,
        reached: f >= amount - 0.009,
        isFinal: idx === 2,
      }
    })
    .filter(Boolean)

  const spread = spreadMilestoneLeftPercents(raw.map((m) => m.trueLeftPercent))
  const milestones = raw.map((m, i) => ({
    ...m,
    leftPercent: spread[i] ?? m.trueLeftPercent,
  }))

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
