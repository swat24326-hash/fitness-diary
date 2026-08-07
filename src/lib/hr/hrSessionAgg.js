/**
 * Агрегат пульса сессии: зоны, оценка ккал (Keytel), min/avg/max.
 * Без React / BLE.
 */

import { normalizeHealthSex } from '../healthCardCore.js'

/** Интервал записи сэмпла в буфер (мс). */
export const HR_SAMPLE_INTERVAL_MS = 5000

/** Макс. точек в RAM на клиента (~3 ч). */
export const HR_SAMPLE_MAX_POINTS = 2200

/** Окно сэмплов для сводки: старее относительно последнего — отбрасываем (хвост чужой тренировки). */
export const HR_SESSION_MAX_SPAN_MS = 4 * 60 * 60 * 1000

/**
 * @param {string | null | undefined} birthDateIso YYYY-MM-DATE
 * @param {string | null | undefined} [asOfIso]
 * @returns {number | null}
 */
export function ageYearsFromBirthDate(birthDateIso, asOfIso) {
  const b = String(birthDateIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return null
  const asOf = String(asOfIso ?? '').slice(0, 10)
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null
  const today = ref
    ? new Date(`${ref}T12:00:00`)
    : new Date()
  const [y, m, d] = b.split('-').map(Number)
  const birth = new Date(y, m - 1, d)
  if (Number.isNaN(birth.getTime())) return null
  let age = today.getFullYear() - birth.getFullYear()
  const md = today.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1
  if (age < 5 || age > 100) return null
  return age
}

/**
 * Оценка макс. ЧСС: 220 − возраст.
 * @param {number | null | undefined} ageYears
 * @returns {number | null}
 */
export function estimateMaxHr(ageYears) {
  const a = Number(ageYears)
  if (!Number.isFinite(a) || a < 5 || a > 100) return null
  return Math.round(220 - a)
}

/**
 * Три зоны от % макс. ЧСС: лёгкая &lt;60%, средняя 60–80%, высокая ≥80%.
 * @param {number} bpm
 * @param {number} maxHr
 * @returns {'easy' | 'mid' | 'hard'}
 */
export function hrZoneForBpm(bpm, maxHr) {
  const hr = Number(bpm)
  const max = Number(maxHr)
  if (!Number.isFinite(hr) || !Number.isFinite(max) || max <= 0) return 'mid'
  const pct = (hr / max) * 100
  if (pct < 60) return 'easy'
  if (pct < 80) return 'mid'
  return 'hard'
}

/**
 * Keytel: ккал за T минут при среднем пульсе.
 * @param {{ avgBpm: number, weightKg: number, ageYears: number, sex: 'male'|'female', durationMin: number }} p
 * @returns {number | null}
 */
export function estimateKcalKeytel(p) {
  const hr = Number(p?.avgBpm)
  const w = Number(p?.weightKg)
  const age = Number(p?.ageYears)
  const minutes = Number(p?.durationMin)
  const sex = normalizeHealthSex(p?.sex)
  if (!sex) return null
  if (![hr, w, age, minutes].every((n) => Number.isFinite(n) && n > 0)) return null
  if (hr < 40 || hr > 220 || w < 30 || w > 250 || minutes > 24 * 60) return null

  const perMin =
    sex === 'male'
      ? (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * age) / 4.184
      : (-20.4022 + 0.1263 * hr + 0.074 * w + 0.4472 * age) / 4.184

  if (!Number.isFinite(perMin) || perMin <= 0) return null
  return Math.round(perMin * minutes)
}

/**
 * Оставить сэмплы в окне [last.t − maxSpanMs, last.t] — иначе duration = дни между старыми точками.
 * @param {Array<{ t?: number, bpm?: number }>} samples
 * @param {number} [maxSpanMs]
 * @returns {Array<{ t: number, bpm: number }>}
 */
export function pruneHrSamplesToRecentWindow(samples, maxSpanMs = HR_SESSION_MAX_SPAN_MS) {
  const span = Number(maxSpanMs)
  const maxSpan = Number.isFinite(span) && span > 0 ? span : HR_SESSION_MAX_SPAN_MS
  const list = (samples ?? [])
    .map((s) => ({
      t: Number(s?.t),
      bpm: Number(s?.bpm),
    }))
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.bpm) && s.bpm > 0 && s.bpm <= 300)
    .sort((a, b) => a.t - b.t)
  if (list.length === 0) return []
  const cutoff = list[list.length - 1].t - maxSpan
  return list.filter((s) => s.t >= cutoff)
}

/**
 * @param {Array<{ t?: number, bpm?: number }>} samples
 * @returns {{ avg: number, min: number, max: number, duration_sec: number, samples_n: number } | null}
 */
export function aggregateHrSamples(samples) {
  const list = pruneHrSamplesToRecentWindow(samples)

  if (list.length === 0) return null

  let min = list[0].bpm
  let max = list[0].bpm
  let sum = 0
  for (const s of list) {
    sum += s.bpm
    if (s.bpm < min) min = s.bpm
    if (s.bpm > max) max = s.bpm
  }
  const avg = Math.round(sum / list.length)
  const duration_sec =
    list.length === 1
      ? Math.round(HR_SAMPLE_INTERVAL_MS / 1000)
      : Math.max(1, Math.round((list[list.length - 1].t - list[0].t) / 1000))

  return {
    avg,
    min: Math.round(min),
    max: Math.round(max),
    duration_sec,
    samples_n: list.length,
  }
}

/**
 * @param {Array<{ t?: number, bpm?: number }>} samples
 * @param {number | null} maxHr
 * @returns {{ easy_pct: number, mid_pct: number, hard_pct: number } | null}
 */
export function computeHrZonePercents(samples, maxHr) {
  const max = Number(maxHr)
  if (!Number.isFinite(max) || max <= 0) return null
  const list = (samples ?? []).filter((s) => {
    const bpm = Number(s?.bpm)
    return Number.isFinite(bpm) && bpm > 0 && bpm <= 300
  })
  if (list.length === 0) return null

  let easy = 0
  let hard = 0
  for (const s of list) {
    const z = hrZoneForBpm(s.bpm, max)
    if (z === 'easy') easy += 1
    else if (z === 'hard') hard += 1
  }
  const n = list.length
  const easy_pct = Math.round((100 * easy) / n)
  const hard_pct = Math.round((100 * hard) / n)
  const mid_pct = Math.max(0, 100 - easy_pct - hard_pct)
  return { easy_pct, mid_pct, hard_pct }
}

/**
 * Нормализация снимка для storage / UI.
 * @param {unknown} raw
 * @returns {object | null}
 */
export function normalizeHrSessionSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null
  const avg = Number(raw.avg)
  const min = Number(raw.min)
  const max = Number(raw.max)
  const duration_sec = Number(raw.duration_sec)
  const samples_n = Number(raw.samples_n)
  if (![avg, min, max].every((n) => Number.isFinite(n) && n > 0)) return null
  const zones =
    raw.zones && typeof raw.zones === 'object'
      ? {
          easy_pct: Math.max(0, Math.min(100, Math.round(Number(raw.zones.easy_pct) || 0))),
          mid_pct: Math.max(0, Math.min(100, Math.round(Number(raw.zones.mid_pct) || 0))),
          hard_pct: Math.max(0, Math.min(100, Math.round(Number(raw.zones.hard_pct) || 0))),
        }
      : null
  const kcalRaw = raw.kcal_est
  const kcal_est =
    kcalRaw == null || kcalRaw === ''
      ? null
      : Number.isFinite(Number(kcalRaw)) && Number(kcalRaw) > 0
        ? Math.round(Number(kcalRaw))
        : null

  return {
    avg: Math.round(avg),
    min: Math.round(min),
    max: Math.round(max),
    duration_sec: Number.isFinite(duration_sec) && duration_sec > 0 ? Math.round(duration_sec) : null,
    samples_n: Number.isFinite(samples_n) && samples_n > 0 ? Math.round(samples_n) : null,
    kcal_est,
    zones,
    computed_at: raw.computed_at ? String(raw.computed_at) : null,
  }
}

/**
 * @param {Array<{ t?: number, bpm?: number }>} samples
 * @param {{
 *   birthDate?: string | null,
 *   sex?: string | null,
 *   weightKg?: number | string | null,
 *   asOfIso?: string | null,
 * }} [ctx]
 */
export function buildHrSessionSummary(samples, ctx = {}) {
  const pruned = pruneHrSamplesToRecentWindow(samples)
  const base = aggregateHrSamples(pruned)
  if (!base) return null

  const age = ageYearsFromBirthDate(ctx.birthDate, ctx.asOfIso)
  const maxHr = estimateMaxHr(age)
  const zones = computeHrZonePercents(pruned, maxHr)
  const weightKg = Number(ctx.weightKg)
  const sex = normalizeHealthSex(ctx.sex)
  const durationMin = (base.duration_sec || 0) / 60
  const kcal_est =
    age != null && sex && Number.isFinite(weightKg) && weightKg > 0
      ? estimateKcalKeytel({
          avgBpm: base.avg,
          weightKg,
          ageYears: age,
          sex,
          durationMin,
        })
      : null

  return normalizeHrSessionSnapshot({
    ...base,
    kcal_est,
    zones,
    computed_at: new Date().toISOString(),
  })
}

/**
 * Добавить сэмпл с downsample (не чаще intervalMs).
 * @param {Array<{ t: number, bpm: number }>} prev
 * @param {number} bpm
 * @param {number} [now]
 * @param {number} [intervalMs]
 * @returns {Array<{ t: number, bpm: number }>}
 */
export function appendHrSample(prev, bpm, now = Date.now(), intervalMs = HR_SAMPLE_INTERVAL_MS) {
  const hr = Number(bpm)
  if (!Number.isFinite(hr) || hr <= 0 || hr > 300) return prev ?? []
  const list = Array.isArray(prev) ? prev.slice() : []
  const last = list[list.length - 1]
  if (last && now - last.t < intervalMs) {
    last.bpm = Math.round(hr)
    return list
  }
  list.push({ t: now, bpm: Math.round(hr) })
  if (list.length > HR_SAMPLE_MAX_POINTS) {
    return list.slice(list.length - HR_SAMPLE_MAX_POINTS)
  }
  return list
}
