/**
 * Вес и обмеры, которые клиент вносит сам в /me (○). Клубные ● не правит.
 */
import { BODY_MEASURE_FIELDS, getMeasureValue } from '../bodyMeasures.js'
import { parseWeightKg } from '../clientWeightCore.js'

export const PROGRESS_SELF_SOURCE = 'client'
export const PROGRESS_CLUB_SOURCE = 'club'

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const WEIGHT_KG_MIN = 20
export const WEIGHT_KG_MAX = 300

/** Клубные источники client_weight_entries (+ вес с тренировки в buildClientProgress). */
export const CLUB_WEIGHT_ENTRY_SOURCES = new Set(['manual', 'training', 'baseline', 'initial_adjust'])

export function isIsoDate(v) {
  return ISO.test(String(v ?? '').slice(0, 10))
}

export function dayIso(v) {
  return String(v ?? '').slice(0, 10)
}

/**
 * @param {unknown} date
 * @param {string} today ISO
 * @returns {{ ok: true, date: string } | { ok: false, error: string }}
 */
export function parseSelfProgressDate(date, today) {
  const d = dayIso(date)
  if (!isIsoDate(d)) return { ok: false, error: 'Укажите дату' }
  if (!isIsoDate(today)) return { ok: false, error: 'Нет даты клуба' }
  if (d > today) return { ok: false, error: 'Дата не может быть в будущем' }
  return { ok: true, date: d }
}

/**
 * @param {unknown} kg
 * @returns {{ ok: true, kg: number } | { ok: false, error: string }}
 */
export function parseSelfWeightKg(kg) {
  const n = parseWeightKg(kg)
  if (n == null) return { ok: false, error: 'Укажите вес' }
  if (n < WEIGHT_KG_MIN || n > WEIGHT_KG_MAX) {
    return { ok: false, error: `Вес от ${WEIGHT_KG_MIN} до ${WEIGHT_KG_MAX} кг` }
  }
  return { ok: true, kg: n }
}

/**
 * @param {object|null|undefined} values
 * @returns {{ ok: true, values: Record<string, number> } | { ok: false, error: string }}
 */
export function parseSelfMeasureValues(values) {
  if (!values || typeof values !== 'object') return { ok: false, error: 'Укажите хотя бы один обмер' }
  const out = {}
  for (const f of BODY_MEASURE_FIELDS) {
    const raw = values[f.id]
    if (raw == null || raw === '') continue
    const n = Number(String(raw).trim().replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n > 300) {
      return { ok: false, error: `Проверьте поле «${f.label}»` }
    }
    out[f.id] = Math.round(n * 10) / 10
  }
  if (!Object.keys(out).length) return { ok: false, error: 'Укажите хотя бы один обмер' }
  return { ok: true, values: out }
}

/** Строка веса из БД — клуб или клиент. */
export function weightEntryProgressSource(row) {
  return String(row?.source ?? '') === PROGRESS_SELF_SOURCE ? PROGRESS_SELF_SOURCE : PROGRESS_CLUB_SOURCE
}

/** Строка обмеров из БД. */
export function measureRowProgressSource(row) {
  return String(row?.source ?? '') === PROGRESS_SELF_SOURCE ? PROGRESS_SELF_SOURCE : PROGRESS_CLUB_SOURCE
}

/**
 * Можно ли клиенту править эту точку прогресса.
 * @param {{ source?: string }} point
 */
export function clientCanEditProgressPoint(point) {
  return point?.source === PROGRESS_SELF_SOURCE && Boolean(point?.id)
}

/**
 * Подпись источника на графике / в форме.
 * @param {'club'|'client'|string|undefined} source
 */
export function progressPointOriginRu(source) {
  return source === PROGRESS_SELF_SOURCE ? 'вы внесли' : 'от клуба'
}

/**
 * Колонки обмеров для записи.
 * @param {Record<string, number>} values
 * @param {{ fillMissingNull?: boolean }} [opts] insert — да (остальные null); update — нет (не затирать)
 */
export function measureValuesToRow(values, opts = {}) {
  const fillMissingNull = opts.fillMissingNull === true
  const row = {}
  for (const f of BODY_MEASURE_FIELDS) {
    if (values[f.id] != null) row[f.id] = values[f.id]
    else if (fillMissingNull) row[f.id] = null
  }
  return row
}

/**
 * День уже занят клубным весом на графике (тренировка / manual / …) — клиентскую ○ не ставим поверх.
 * @param {{ date?: string, source?: string }[]|null|undefined} progressWeights
 * @param {string} date
 */
export function progressDayHasClubWeight(progressWeights, date) {
  const d = dayIso(date)
  return (progressWeights ?? []).some((w) => dayIso(w.date) === d && w.source !== PROGRESS_SELF_SOURCE)
}

/**
 * @param {{ date?: string, source?: string }[]|null|undefined} progressMeasures
 * @param {string} date
 */
export function progressDayHasClubMeasure(progressMeasures, date) {
  const d = dayIso(date)
  return (progressMeasures ?? []).some((m) => dayIso(m.date) === d && m.source !== PROGRESS_SELF_SOURCE)
}

/**
 * Прочитать values из строки БД (для ответа/редактора).
 * @param {object} row
 */
export function measureRowToValues(row) {
  const values = {}
  for (const f of BODY_MEASURE_FIELDS) {
    const n = Number(getMeasureValue(row, f.id))
    if (Number.isFinite(n) && n > 0) values[f.id] = n
  }
  return values
}

function newLocalId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * DEV-превью: upsert своей точки веса.
 * @returns {{ ok: true, progress: object } | { ok: false, error: string, progress: object }}
 */
export function previewUpsertWeight(progress, input) {
  const date = dayIso(input.date)
  const kg = parseWeightKg(input.kg)
  if (!isIsoDate(date) || kg == null) {
    return { ok: false, error: 'Укажите дату и вес', progress }
  }
  const weights = [...(progress?.weights ?? [])]
  const id = String(input.id ?? '').trim() || newLocalId()
  const without = weights.filter((w) => {
    if (id && w.id === id) return false
    if (w.source === PROGRESS_SELF_SOURCE && dayIso(w.date) === date) return false
    return true
  })
  if (progressDayHasClubWeight(without, date)) {
    return {
      ok: false,
      error: 'В этот день уже есть вес от клуба — его нельзя заменить',
      progress,
    }
  }
  without.push({ date, kg, source: PROGRESS_SELF_SOURCE, id })
  without.sort((a, b) => dayIso(a.date).localeCompare(dayIso(b.date)))
  return { ok: true, progress: { ...progress, weights: without } }
}

/** @param {object} progress @param {string} id */
export function previewDeleteWeight(progress, id) {
  const rid = String(id ?? '')
  return {
    ok: true,
    progress: {
      ...progress,
      weights: (progress?.weights ?? []).filter((w) => !(w.source === PROGRESS_SELF_SOURCE && w.id === rid)),
    },
  }
}

/**
 * @returns {{ ok: true, progress: object } | { ok: false, error: string, progress: object }}
 */
export function previewUpsertMeasure(progress, input) {
  const date = dayIso(input.date)
  const parsed = parseSelfMeasureValues(input.values)
  if (!isIsoDate(date) || !parsed.ok) {
    return { ok: false, error: parsed.ok === false ? parsed.error : 'Укажите дату', progress }
  }
  const list = [...(progress?.measurements ?? [])]
  const id = String(input.id ?? '').trim() || newLocalId()
  const without = list.filter((m) => {
    if (id && m.id === id) return false
    if (m.source === PROGRESS_SELF_SOURCE && dayIso(m.date) === date) return false
    return true
  })
  if (progressDayHasClubMeasure(without, date)) {
    return {
      ok: false,
      error: 'В этот день уже есть обмеры от клуба — их нельзя заменить',
      progress,
    }
  }
  without.push({
    date,
    values: parsed.values,
    source: PROGRESS_SELF_SOURCE,
    id,
    editable: true,
  })
  without.sort((a, b) => dayIso(a.date).localeCompare(dayIso(b.date)))
  return { ok: true, progress: { ...progress, measurements: without } }
}

/** @param {object} progress @param {string} id */
export function previewDeleteMeasure(progress, id) {
  const rid = String(id ?? '')
  return {
    ok: true,
    progress: {
      ...progress,
      measurements: (progress?.measurements ?? []).filter(
        (m) => !(m.source === PROGRESS_SELF_SOURCE && m.id === rid),
      ),
    },
  }
}
