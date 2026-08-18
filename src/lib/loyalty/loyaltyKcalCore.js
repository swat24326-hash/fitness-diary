import { ageYearsFromBirthDate, estimateKcalKeytel, HR_SAMPLE_INTERVAL_MS } from '../hr/hrSessionAgg.js'

/**
 * @typedef {object} LoyaltyKcalInput
 * @property {Array<{ t?: number, bpm?: number }>} [samples]
 * @property {string | number} [sessionStartedAt]
 * @property {{ birthDate?: string, sex?: string, weightKg?: number, asOfIso?: string }} [health]
 * @property {number} [maxMinutes]
 * @property {number} [maxKcal]
 */

/**
 * Ккал лояльности на первом complete. Сэмплы только в окне первого часа (maxMinutes).
 * @param {LoyaltyKcalInput} [p]
 * @returns {number}
 */
export function computeLoyaltyKcal(p = {}) {
  const startMs = Date.parse(String(p.sessionStartedAt ?? ''))
  if (!Number.isFinite(startMs)) return 0
  const maxMinutes = Number(p.maxMinutes)
  const capMin = Number.isFinite(maxMinutes) && maxMinutes > 0 ? maxMinutes : 60
  const windowEnd = startMs + capMin * 60 * 1000
  const maxKcalRaw = Number(p.maxKcal)
  const maxKcal = Number.isFinite(maxKcalRaw) && maxKcalRaw >= 0 ? maxKcalRaw : 800

  const inWindow = (p.samples ?? [])
    .map((s) => ({ t: Number(s?.t), bpm: Number(s?.bpm) }))
    .filter(
      (s) =>
        Number.isFinite(s.t) &&
        s.t >= startMs &&
        s.t <= windowEnd &&
        Number.isFinite(s.bpm) &&
        s.bpm > 0 &&
        s.bpm <= 300,
    )
    .sort((a, b) => a.t - b.t)

  if (inWindow.length === 0) return 0

  const health = p.health ?? {}
  const asOf = String(health.asOfIso ?? '').slice(0, 10) || undefined
  const age = ageYearsFromBirthDate(health.birthDate, asOf)
  const weightKg = Number(health.weightKg)
  const sex = health.sex
  if (age == null || !Number.isFinite(weightKg) || weightKg <= 0) return 0

  const avgBpm = inWindow.reduce((sum, s) => sum + s.bpm, 0) / inWindow.length
  const durationMin =
    inWindow.length === 1
      ? HR_SAMPLE_INTERVAL_MS / 60000
      : Math.min(capMin, (inWindow[inWindow.length - 1].t - inWindow[0].t) / 60000)
  if (!(durationMin > 0)) return 0

  const est = estimateKcalKeytel({
    avgBpm,
    weightKg,
    ageYears: age,
    sex,
    durationMin,
  })
  if (est == null) return 0
  return Math.min(maxKcal, Math.max(0, Math.round(est)))
}
