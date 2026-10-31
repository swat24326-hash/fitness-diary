export const BODY_MEASURE_FIELDS = [
  { id: 'neck', label: 'Шея' },
  { id: 'chest', label: 'Грудь' },
  { id: 'arm_r', label: 'Рука правая', side: 'правая' },
  { id: 'arm_l', label: 'Рука левая', side: 'левая' },
  { id: 'waist_upper', label: 'Талия верх', side: 'верх' },
  { id: 'waist_lower', label: 'Талия низ', side: 'низ' },
  { id: 'glutes', label: 'Ягодицы' },
  { id: 'thigh_r', label: 'Бедро правое', side: 'правое' },
  { id: 'thigh_l', label: 'Бедро левое', side: 'левое' },
  { id: 'calf_r', label: 'Голень правая', side: 'правая' },
  { id: 'calf_l', label: 'Голень левая', side: 'левая' },
]

/** Строки истории: одиночные параметры и пары (правая/левая, верх/низ). */
export const BODY_MEASURE_GROUPS = [
  { id: 'neck', label: 'Шея', fields: ['neck'] },
  { id: 'chest', label: 'Грудь', fields: ['chest'] },
  { id: 'arm', label: 'Рука', fields: ['arm_r', 'arm_l'] },
  { id: 'waist', label: 'Талия', fields: ['waist_upper', 'waist_lower'] },
  { id: 'glutes', label: 'Ягодицы', fields: ['glutes'] },
  { id: 'thigh', label: 'Бедро', fields: ['thigh_r', 'thigh_l'] },
  { id: 'calf', label: 'Голень', fields: ['calf_r', 'calf_l'] },
]

const FIELD_BY_ID = Object.fromEntries(BODY_MEASURE_FIELDS.map((f) => [f.id, f]))

const FALLBACKS = {
  arm_r: ['arm'],
  arm_l: ['arm'],
  waist_upper: ['waist'],
  waist_lower: ['waist'],
  glutes: ['hips'],
  thigh_r: ['thigh'],
  thigh_l: ['thigh'],
  calf_r: ['calf'],
  calf_l: ['calf'],
}

/** Нормализация даты и полей после ответа API / Supabase. */
export function normalizeBodyMeasurementRow(row) {
  if (!row || typeof row !== 'object') return row
  const r = { ...row }
  if (r.date != null) r.date = String(r.date).slice(0, 10)
  return r
}

export function getMeasureValue(row, key) {
  if (!row) return null
  const v = row[key]
  if (v != null && v !== '') return v
  const fb = FALLBACKS[key]
  if (!fb?.length) return v ?? null
  for (const k of fb) {
    const x = row[k]
    if (x != null && x !== '') return x
  }
  return null
}

/** Строки для экрана замера: подпись группы и ячейки со стороной. */
export function bodyMeasureLines() {
  return BODY_MEASURE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    cells: group.fields.map((id) => ({
      id,
      side: FIELD_BY_ID[id]?.side ?? null,
    })),
  }))
}

/**
 * Строки формы ввода (клиент /me): пара правая|левая (или верх|низ) в одном ряду;
 * одиночные без пары — своя строка; два одиночных подряд (шея|грудь) — рядом.
 * @returns {Array<Array<(typeof BODY_MEASURE_FIELDS)[number]>>}
 */
export function bodyMeasureFormRows() {
  const rows = []
  /** @type {(typeof BODY_MEASURE_FIELDS)[number] | null} */
  let pending = null
  for (const group of BODY_MEASURE_GROUPS) {
    if (group.fields.length >= 2) {
      if (pending) {
        rows.push([pending])
        pending = null
      }
      rows.push(group.fields.map((id) => FIELD_BY_ID[id]).filter(Boolean))
      continue
    }
    const field = FIELD_BY_ID[group.fields[0]]
    if (!field) continue
    if (pending) {
      rows.push([pending, field])
      pending = null
    } else {
      pending = field
    }
  }
  if (pending) rows.push([pending])
  return rows
}

/**
 * Сантиметры для таблицы: целое без дроби, десятые через запятую.
 * @returns {string | null}
 */
export function formatMeasureCm(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(1).replace('.', ',')
}
