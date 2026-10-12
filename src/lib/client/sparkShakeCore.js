/**
 * «Потрясите телефон» на графике веса /me (без React): распознать тряску по датчику движения,
 * пустить по графику волну и решить, показывать ли подсказку.
 */

/** Рывок, м/с²: сумма изменений по трём осям между замерами датчика не чаще раза в SHAKE_SAMPLE_MS. */
export const SHAKE_DELTA = 14
export const SHAKE_SAMPLE_MS = 80
/** Тряска — три рывка за SHAKE_WINDOW_MS (хотя бы одно качание туда-обратно-туда).
 *  Толчок (положил на стол) даёт два рывка — «туда» и «обратно» — и тряской не считается. */
export const SHAKE_WINDOW_MS = 1000
export const SHAKE_PEAKS = 3
/** После тряски молчим, пока точки не сели на график. */
export const SHAKE_COOLDOWN_MS = 2000
const STRONG_DELTA = 40

/**
 * @returns {(x: number, y: number, z: number, t: number) => number|null} сила тряски 0..1 или null
 */
export function createShakeDetector() {
  let last = null
  let peaks = []
  let maxDelta = 0
  let quietUntil = 0
  return function feed(x, y, z, t) {
    if (![x, y, z, t].every(Number.isFinite)) return null
    if (last && t - last.t < SHAKE_SAMPLE_MS) return null
    const prev = last
    last = { x, y, z, t }
    if (!prev || t < quietUntil) return null
    const delta = Math.abs(x - prev.x) + Math.abs(y - prev.y) + Math.abs(z - prev.z)
    if (delta < SHAKE_DELTA) return null
    peaks = peaks.filter((p) => t - p <= SHAKE_WINDOW_MS)
    peaks.push(t)
    maxDelta = peaks.length === 1 ? delta : Math.max(maxDelta, delta)
    if (peaks.length < SHAKE_PEAKS) return null
    peaks = []
    quietUntil = t + SHAKE_COOLDOWN_MS
    return Math.min(1, (maxDelta - SHAKE_DELTA) / (STRONG_DELTA - SHAKE_DELTA))
  }
}

const JUMP_MIN = 14
const JUMP_MAX = 40

/**
 * Размах волны у каждой точки, px (минус — вверх). Сильнее тряска — выше, но не улетают; чуть разные — живее.
 * @returns {number[]}
 */
export function sparkWaveAmps(count, strength, rand = Math.random) {
  const s = Math.min(1, Math.max(0, Number(strength) || 0))
  const top = JUMP_MIN + (JUMP_MAX - JUMP_MIN) * s
  return Array.from({ length: Math.max(0, Math.floor(Number(count) || 0)) }, () => -Math.round(top * (0.6 + rand() * 0.4)))
}

/** Волна бежит слева направо: каждая следующая точка стартует на SPARK_WAVE_STAGGER_MS позже. */
export const SPARK_WAVE_STAGGER_MS = 45
/** Сколько качается одна точка: затухающие колебания, к концу — ровно на месте. */
export const SPARK_WAVE_POINT_MS = 1000
const WAVE_HZ = 3
const WAVE_DECAY_MS = 280

/** Сколько длится вся волна для count точек, мс. */
export function sparkWaveDuration(count) {
  return SPARK_WAVE_POINT_MS + SPARK_WAVE_STAGGER_MS * Math.max(0, (Number(count) || 0) - 1)
}

/**
 * Смещение точки по вертикали в момент t (мс от начала тряски), px: сначала вверх, потом затухающие качания.
 * Линия строится по тем же смещённым точкам — гнётся вместе с ними.
 */
export function sparkWaveLift(amp, index, t) {
  const tau = t - index * SPARK_WAVE_STAGGER_MS
  if (!(tau > 0) || tau >= SPARK_WAVE_POINT_MS || !Number.isFinite(amp)) return 0
  return amp * Math.sin((2 * Math.PI * WAVE_HZ * tau) / 1000) * Math.exp(-tau / WAVE_DECAY_MS)
}

/** Подсказку показываем первые SHAKE_HINT_MAX_VIEWS заходов, пока человек не потряс / не нажал / не отказал. */
export const SHAKE_HINT_MAX_VIEWS = 5

/**
 * @param {{ support: 'none'|'open'|'ask', done?: boolean, views?: number }} p
 *   support: 'open' — датчик доступен сразу (Android), 'ask' — нужно разрешение по нажатию (iPhone)
 * @returns {'ask'|'try'|null} ask — кнопка спросит разрешение, try — кнопка покажет анимацию
 */
export function shakeHintMode({ support, done = false, views = 0 }) {
  if (support !== 'open' && support !== 'ask') return null
  if (done || views > SHAKE_HINT_MAX_VIEWS) return null
  return support === 'ask' ? 'ask' : 'try'
}
