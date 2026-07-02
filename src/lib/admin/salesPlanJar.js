/** Раскладка монет в банке плана продаж (0–100% внутри, >100% — горка и просып). */

export const JAR_INNER_COIN_SLOTS = 24
export const JAR_SPILL_COIN_SLOTS = 10

/** @type {Array<{ x: number, y: number, r?: number }>} x/y в % от области банки */
const INNER_SLOTS = [
  { x: 18, y: 92, r: -8 },
  { x: 32, y: 94, r: 5 },
  { x: 50, y: 93, r: -3 },
  { x: 68, y: 95, r: 7 },
  { x: 82, y: 92, r: -5 },
  { x: 24, y: 82, r: 4 },
  { x: 40, y: 84, r: -6 },
  { x: 56, y: 83, r: 2 },
  { x: 72, y: 85, r: -4 },
  { x: 48, y: 74, r: 6 },
  { x: 30, y: 72, r: -2 },
  { x: 66, y: 73, r: 3 },
  { x: 22, y: 62, r: -7 },
  { x: 38, y: 64, r: 5 },
  { x: 54, y: 63, r: -1 },
  { x: 70, y: 65, r: 4 },
  { x: 82, y: 62, r: -5 },
  { x: 44, y: 52, r: 3 },
  { x: 58, y: 51, r: -4 },
  { x: 32, y: 42, r: 6 },
  { x: 50, y: 40, r: -2 },
  { x: 68, y: 41, r: 5 },
  { x: 40, y: 30, r: -3 },
  { x: 60, y: 28, r: 4 },
]

/** Горка на горлышке + просып (координаты от верха сцены банки) */
const RIM_SLOTS = [
  { x: 38, y: 6, r: -12 },
  { x: 50, y: 2, r: 4 },
  { x: 62, y: 5, r: 10 },
  { x: 46, y: -4, r: -6 },
  { x: 58, y: -3, r: 8 },
]

const SPILL_SLOTS = [
  { x: 8, y: 78, r: -18 },
  { x: 2, y: 88, r: -25 },
  { x: 88, y: 80, r: 15 },
  { x: 94, y: 90, r: 22 },
  { x: 14, y: 96, r: -10 },
  { x: 86, y: 95, r: 12 },
  { x: 50, y: -10, r: 0 },
  { x: 42, y: -14, r: -8 },
  { x: 58, y: -12, r: 6 },
  { x: 50, y: 102, r: 0 },
]

/**
 * @param {number} progressPercent — может быть > 100
 * @returns {{ inner: object[], rim: object[], spill: object[], fillRatio: number, overflow: boolean }}
 */
export function buildJarCoinLayout(progressPercent) {
  const pct = Number(progressPercent) || 0
  const fillRatio = Math.min(1, Math.max(0, pct / 100))
  const innerCount = Math.round(fillRatio * JAR_INNER_COIN_SLOTS)
  const inner = INNER_SLOTS.slice(0, innerCount).map((slot, i) => ({
    id: `in-${i}`,
    ...slot,
    delayMs: i * 35,
  }))

  const overflow = pct > 100
  let rim = []
  let spill = []
  if (overflow) {
    const over = Math.min(1, (pct - 100) / 100)
    const rimCount = Math.max(1, Math.ceil(over * RIM_SLOTS.length))
    const spillCount = Math.max(1, Math.ceil(over * SPILL_SLOTS.length))
    rim = RIM_SLOTS.slice(0, rimCount).map((slot, i) => ({
      id: `rim-${i}`,
      ...slot,
      delayMs: 80 + i * 45,
    }))
    spill = SPILL_SLOTS.slice(0, spillCount).map((slot, i) => ({
      id: `sp-${i}`,
      ...slot,
      delayMs: 120 + i * 55,
    }))
  }

  return { inner, rim, spill, fillRatio, overflow }
}
