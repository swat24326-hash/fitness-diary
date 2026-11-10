/**
 * Целевой диапазон, вердикт и поминутный ряд для сводки пульса.
 * Методика зала: % от ЧССмакс ≈ 220 − возраст (лёгкая &lt;60% / средняя 60–80% = цель / высокая ≥80%).
 * Без React / BLE. Границы совпадают с hrZoneForBpm.
 */

/** Макс. точек графика (≈ 3 ч). */
export const HR_SERIES_MAX_MINUTES = 180

/** Пороги методики (% от ЧССмакс). */
export const HR_ZONE_EASY_MAX_PCT = 60
export const HR_ZONE_HARD_MIN_PCT = 80

/**
 * Границы зон в уд/мин по макс. ЧСС.
 * Лёгкая: bpm &lt; mid_lo; средняя: mid_lo…hard_lo−1; высокая: ≥ hard_lo.
 * @param {number | null | undefined} maxHr
 * @returns {{ mid_lo: number, hard_lo: number, target_lo: number, target_hi: number } | null}
 */
export function hrZoneBoundsBpm(maxHr) {
  const max = Number(maxHr)
  if (!Number.isFinite(max) || max <= 0) return null
  const mid_lo = Math.ceil(max * (HR_ZONE_EASY_MAX_PCT / 100))
  const hard_lo = Math.ceil(max * (HR_ZONE_HARD_MIN_PCT / 100))
  if (!(mid_lo > 0 && hard_lo > mid_lo)) return null
  return {
    mid_lo,
    hard_lo,
    target_lo: mid_lo,
    target_hi: hard_lo - 1,
  }
}

/**
 * Строки зон для UI: название, % методики, BPM, флаг цели.
 * @param {number | null | undefined} maxHr
 * @returns {Array<{
 *   key: 'easy'|'mid'|'hard',
 *   title: string,
 *   method_pct: string,
 *   bpm_range: string,
 *   is_target: boolean,
 * }> | null}
 */
export function hrZoneMethodRows(maxHr) {
  const b = hrZoneBoundsBpm(maxHr)
  if (!b) return null
  return [
    {
      key: 'easy',
      title: 'Лёгкая',
      method_pct: `<${HR_ZONE_EASY_MAX_PCT}%`,
      bpm_range: `<${b.mid_lo}`,
      is_target: false,
    },
    {
      key: 'mid',
      title: 'Средняя',
      method_pct: `${HR_ZONE_EASY_MAX_PCT}–${HR_ZONE_HARD_MIN_PCT}%`,
      bpm_range: `${b.mid_lo}–${b.hard_lo - 1}`,
      is_target: true,
    },
    {
      key: 'hard',
      title: 'Высокая',
      method_pct: `≥${HR_ZONE_HARD_MIN_PCT}%`,
      bpm_range: `≥${b.hard_lo}`,
      is_target: false,
    },
  ]
}

/**
 * @param {number | null | undefined} maxHr
 * @returns {{ lo: number, hi: number } | null}
 */
export function hrTargetRangeFromMaxHr(maxHr) {
  const b = hrZoneBoundsBpm(maxHr)
  if (!b) return null
  return { lo: b.target_lo, hi: b.target_hi }
}

/** Цель полного кольца «в цели»: доля сессии в средней зоне, %. */
export const HR_RING_GOAL_IN_TARGET_PCT = 50
/** Цель полного кольца «нагрузка»: mid+hard, %. */
export const HR_RING_GOAL_LOAD_PCT = 60
/** Цель полного кольца «время»: минуты сессии с датчиком. */
export const HR_RING_GOAL_DURATION_MIN = 60

/**
 * Три кольца Garmin-стиля: 0…1 fill, полное = цель достигнута.
 * @param {{
 *   zones?: { easy_pct?: number, mid_pct?: number, hard_pct?: number } | null,
 *   durationMin?: number | null,
 * }} p
 * @returns {Array<{
 *   key: 'target'|'load'|'time',
 *   title: string,
 *   fill: number,
 *   valueLabel: string,
 *   goalLabel: string,
 * }> | null}
 */
export function buildHrSessionGoalRings(p = {}) {
  const zones = p?.zones
  if (!zones || typeof zones !== 'object') return null
  const mid = Math.max(0, Math.min(100, Math.round(Number(zones.mid_pct) || 0)))
  const hard = Math.max(0, Math.min(100, Math.round(Number(zones.hard_pct) || 0)))
  const load = Math.max(0, Math.min(100, mid + hard))
  const durationMin = Number(p?.durationMin)
  const dur = Number.isFinite(durationMin) && durationMin > 0 ? Math.round(durationMin) : null

  const clamp01 = (n) => Math.max(0, Math.min(1, n))

  /** @type {Array<{ key: 'target'|'load'|'time', title: string, fill: number, valueLabel: string, goalLabel: string }>} */
  const rings = [
    {
      key: 'target',
      title: 'В цели',
      fill: clamp01(mid / HR_RING_GOAL_IN_TARGET_PCT),
      valueLabel: `${mid}%`,
      goalLabel: `${HR_RING_GOAL_IN_TARGET_PCT}%`,
    },
    {
      key: 'load',
      title: 'Нагрузка',
      fill: clamp01(load / HR_RING_GOAL_LOAD_PCT),
      valueLabel: `${load}%`,
      goalLabel: `${HR_RING_GOAL_LOAD_PCT}%`,
    },
  ]
  if (dur != null) {
    rings.push({
      key: 'time',
      title: 'Время',
      fill: clamp01(dur / HR_RING_GOAL_DURATION_MIN),
      valueLabel: `${dur}`,
      goalLabel: `${HR_RING_GOAL_DURATION_MIN} мин`,
    })
  }
  return rings
}

/**
 * Короткая фраза для тренера по доле времени в зонах.
 * @param {{ easy_pct?: number, mid_pct?: number, hard_pct?: number } | null | undefined} zones
 * @returns {string | null}
 */
export function hrSessionTargetVerdict(zones) {
  if (!zones || typeof zones !== 'object') return null
  const easy = Math.max(0, Math.min(100, Math.round(Number(zones.easy_pct) || 0)))
  const mid = Math.max(0, Math.min(100, Math.round(Number(zones.mid_pct) || 0)))
  const hard = Math.max(0, Math.min(100, Math.round(Number(zones.hard_pct) || 0)))
  if (easy + mid + hard <= 0) return null
  if (mid >= 55) return 'Большая часть времени в цели'
  if (hard >= 40) return 'Часто выше цели'
  if (easy >= 70) return 'Почти всё время ниже цели'
  if (mid >= 25) return 'Часть времени в цели'
  return 'Смешанная нагрузка'
}

/**
 * Средний BPM по минутам от первого сэмпла (компактный ряд для дневника).
 * @param {Array<{ t?: number, bpm?: number }>} samples
 * @param {number} [maxMinutes]
 * @returns {number[] | null}
 */
export function buildHrMinuteSeries(samples, maxMinutes = HR_SERIES_MAX_MINUTES) {
  const cap = Number.isFinite(Number(maxMinutes)) && Number(maxMinutes) > 0
    ? Math.min(HR_SERIES_MAX_MINUTES, Math.round(Number(maxMinutes)))
    : HR_SERIES_MAX_MINUTES
  const list = (samples ?? [])
    .map((s) => ({ t: Number(s?.t), bpm: Number(s?.bpm) }))
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.bpm) && s.bpm > 0 && s.bpm <= 300)
    .sort((a, b) => a.t - b.t)
  if (list.length === 0) return null

  const t0 = list[0].t
  /** @type {Map<number, { sum: number, n: number }>} */
  const buckets = new Map()
  for (const s of list) {
    const m = Math.max(0, Math.floor((s.t - t0) / 60_000))
    if (m >= cap) continue
    const prev = buckets.get(m)
    if (prev) {
      prev.sum += s.bpm
      prev.n += 1
    } else {
      buckets.set(m, { sum: s.bpm, n: 1 })
    }
  }
  if (buckets.size === 0) return null

  const lastM = Math.min(cap - 1, Math.max(...buckets.keys()))
  const series = []
  let lastBpm = Math.round(list[0].bpm)
  for (let m = 0; m <= lastM; m += 1) {
    const b = buckets.get(m)
    if (b) lastBpm = Math.round(b.sum / b.n)
    series.push(lastBpm)
  }
  return series.length ? series : null
}
