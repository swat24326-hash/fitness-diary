/**
 * Упрощённый женский цикл + разметка дней календаря /me (без React).
 * Фазы и подсказки — расчёт по параметрам клиента, не медпрогноз.
 * Вкл/выкл — в профиле /me, без привязки к полу в карте здоровья.
 */

export const CYCLE_DAYS_MIN = 21
export const CYCLE_DAYS_MAX = 45
export const PERIOD_DAYS_MIN = 1
export const PERIOD_DAYS_MAX = 10
export const CYCLE_DEFAULT = { cycle_days: 28, period_days: 5 }

/** @typedef {'period'|'follicular'|'ovulation'|'luteal'} CyclePhase */
/** @typedef {'done'|'planned'|'noshow'} TrainingMarker */

/**
 * @param {unknown} iso
 * @returns {string|null} YYYY-MM-DD
 */
export function parseCycleIsoDate(iso) {
  const s = String(iso ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return s
}

/** @param {string} iso YYYY-MM-DD */
export function cycleIsoToUtcDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/** @param {number} utcDay */
export function cycleUtcDayToIso(utcDay) {
  const dt = new Date(utcDay * 86400000)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {unknown} n
 * @param {number} min
 * @param {number} max
 */
function parseIntInRange(n, min, max) {
  const v = typeof n === 'number' ? n : Number(String(n ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(v) || !Number.isInteger(v)) return null
  if (v < min || v > max) return null
  return v
}

/**
 * @param {unknown} raw
 * @param {string} [todayIso]
 * @returns {{ ok: true, value: { enabled: boolean, cycle_days: number, period_days: number, last_period_start: string|null } } | { ok: false, error: string }}
 */
export function parseCycleSettingsInput(raw, todayIso) {
  const enabled = Boolean(raw?.enabled)
  if (!enabled) {
    return {
      ok: true,
      value: {
        enabled: false,
        cycle_days: CYCLE_DEFAULT.cycle_days,
        period_days: CYCLE_DEFAULT.period_days,
        last_period_start: null,
      },
    }
  }
  const cycle_days = parseIntInRange(raw?.cycle_days ?? CYCLE_DEFAULT.cycle_days, CYCLE_DAYS_MIN, CYCLE_DAYS_MAX)
  if (cycle_days == null) {
    return { ok: false, error: `Длина цикла — целое число от ${CYCLE_DAYS_MIN} до ${CYCLE_DAYS_MAX}` }
  }
  const period_days = parseIntInRange(raw?.period_days ?? CYCLE_DEFAULT.period_days, PERIOD_DAYS_MIN, PERIOD_DAYS_MAX)
  if (period_days == null) {
    return { ok: false, error: `Дни месячных — целое число от ${PERIOD_DAYS_MIN} до ${PERIOD_DAYS_MAX}` }
  }
  if (period_days >= cycle_days) {
    return { ok: false, error: 'Дни месячных должны быть меньше длины цикла' }
  }
  const last = parseCycleIsoDate(raw?.last_period_start)
  if (!last) {
    return { ok: false, error: 'Укажите дату начала последних месячных' }
  }
  const today = parseCycleIsoDate(todayIso)
  if (today && last > today) {
    return { ok: false, error: 'Дата начала не может быть в будущем' }
  }
  return { ok: true, value: { enabled: true, cycle_days, period_days, last_period_start: last } }
}

/**
 * Белый список для GET /api/client-me и ответов POST.
 * @param {object|null|undefined} row
 */
export function publicClientCycle(row) {
  if (!row || row.enabled !== true) {
    return { enabled: false }
  }
  const cycle_days = Number(row.cycle_days) || CYCLE_DEFAULT.cycle_days
  const period_days = Number(row.period_days) || CYCLE_DEFAULT.period_days
  const last = parseCycleIsoDate(row.last_period_start)
  if (!last) return { enabled: false }
  return {
    enabled: true,
    cycle_days,
    period_days,
    last_period_start: last,
  }
}

/**
 * День внутри цикла 0…cycle_days-1 или null.
 * @param {string} dayIso
 * @param {{ enabled?: boolean, cycle_days?: number, period_days?: number, last_period_start?: string|null }|null|undefined} settings
 */
export function cycleDayIndex(dayIso, settings) {
  const pub = publicClientCycle(settings)
  if (!pub.enabled) return null
  const day = parseCycleIsoDate(dayIso)
  if (!day) return null
  const start = cycleIsoToUtcDay(pub.last_period_start)
  const cur = cycleIsoToUtcDay(day)
  const delta = cur - start
  if (delta < 0) return null
  return delta % pub.cycle_days
}

/**
 * @param {string} dayIso
 * @param {object|null|undefined} settings
 * @returns {CyclePhase|null}
 */
export function cyclePhaseForDay(dayIso, settings) {
  const pub = publicClientCycle(settings)
  if (!pub.enabled) return null
  const idx = cycleDayIndex(dayIso, pub)
  if (idx == null) return null
  if (idx < pub.period_days) return 'period'
  const ovu = Math.round(pub.cycle_days / 2)
  if (idx === ovu || idx === ovu - 1) return 'ovulation'
  if (idx < ovu) return 'follicular'
  return 'luteal'
}

/** @param {CyclePhase|null|undefined} phase */
export function cyclePhaseLabelRu(phase) {
  if (phase === 'period') return 'Месячные'
  if (phase === 'follicular') return 'Фолликулярная'
  if (phase === 'ovulation') return 'Овуляция'
  if (phase === 'luteal') return 'Лютеиновая'
  return ''
}

/**
 * Короткая подсказка по нагрузке (ориентир, не медсовет).
 * @param {CyclePhase|null|undefined} phase
 */
export function cyclePhaseTrainingHintRu(phase) {
  if (phase === 'period') return 'Лёгкая нагрузка — слушайте самочувствие'
  if (phase === 'follicular') return 'Обычно удобнее наращивать объём'
  if (phase === 'ovulation') return 'Силы часто выше — без фанатизма'
  if (phase === 'luteal') return 'Осторожнее с объёмом и тяжестями'
  return ''
}

/**
 * @param {object|null|undefined} memberships
 * @param {{ date?: string }|null|undefined} nextSession
 * @param {Array<{ date?: string }>|null|undefined} [upcomingSessions]
 * @returns {Map<string, TrainingMarker>}
 */
export function collectClientTrainingMarkers(memberships, nextSession, upcomingSessions) {
  /** @type {Map<string, TrainingMarker>} */
  const byDate = new Map()
  const rows = [...(memberships?.current ?? []), memberships?.last_ended].filter(Boolean)
  for (const m of rows) {
    for (const v of m.visits ?? []) {
      const d = parseCycleIsoDate(v?.date)
      if (!d) continue
      byDate.set(d, v.no_show ? 'noshow' : 'done')
    }
  }
  const plannedList = Array.isArray(upcomingSessions) && upcomingSessions.length
    ? upcomingSessions
    : nextSession
      ? [nextSession]
      : []
  for (const session of plannedList) {
    const planned = parseCycleIsoDate(session?.date)
    if (planned && !byDate.has(planned)) byDate.set(planned, 'planned')
  }
  return byDate
}

/**
 * @param {{ date?: string, kg?: number }[]|null|undefined} weights
 * @returns {Map<string, number>}
 */
export function collectWeightByDay(weights) {
  /** @type {Map<string, number>} */
  const map = new Map()
  for (const w of weights ?? []) {
    const d = parseCycleIsoDate(w?.date)
    const kg = Number(w?.kg)
    if (!d || !Number.isFinite(kg)) continue
    map.set(d, kg)
  }
  return map
}

/**
 * Сетка месяца (пн…вс), ISO-неделя.
 * @param {{
 *   year: number
 *   month: number
 *   settings?: object|null
 *   memberships?: object|null
 *   nextSession?: object|null
 *   upcomingSessions?: Array<{ date?: string }>|null
 *   weights?: object[]|null
 *   todayIso?: string
 * }} input
 */
export function buildCycleCalendarMonth(input) {
  const year = Number(input.year)
  const month = Number(input.month)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { year: 0, month: 0, weeks: [], legendHint: 'ориентир, не медсовет' }
  }
  const settings = publicClientCycle(input.settings)
  const trainings = collectClientTrainingMarkers(input.memberships, input.nextSession, input.upcomingSessions)
  const weights = collectWeightByDay(input.weights)
  const today = parseCycleIsoDate(input.todayIso)

  const firstUtc = Math.floor(Date.UTC(year, month - 1, 1) / 86400000)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday = (new Date(firstUtc * 86400000).getUTCDay() + 6) % 7 // Mon=0
  /** @type {{ iso: string|null, day: number|null, inMonth: boolean, phase: CyclePhase|null, training: TrainingMarker|null, weightKg: number|null, isToday: boolean }[]} */
  const cells = []
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ iso: null, day: null, inMonth: false, phase: null, training: null, weightKg: null, isToday: false })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = cycleUtcDayToIso(firstUtc + day - 1)
    cells.push({
      iso,
      day,
      inMonth: true,
      phase: settings.enabled ? cyclePhaseForDay(iso, settings) : null,
      training: trainings.get(iso) ?? null,
      weightKg: weights.has(iso) ? weights.get(iso) : null,
      isToday: today === iso,
    })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ iso: null, day: null, inMonth: false, phase: null, training: null, weightKg: null, isToday: false })
  }
  /** @type {typeof cells[]} */
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return {
    year,
    month,
    weeks,
    cycleEnabled: settings.enabled,
    legendHint: 'ориентир, не медсовет',
  }
}

/** @param {number} year @param {number} month 1–12 */
export function shiftCalendarMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

/** Подпись месяца по-русски */
export function calendarMonthTitleRu(year, month) {
  const names = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ]
  const name = names[month - 1] ?? ''
  return `${name} ${year}`
}
