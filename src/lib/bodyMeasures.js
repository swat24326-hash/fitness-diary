export const BODY_MEASURE_FIELDS = [
  { id: 'neck', label: 'Шея' },
  { id: 'chest', label: 'Грудь' },
  { id: 'arm_r', label: 'Рука П' },
  { id: 'arm_l', label: 'Рука Л' },
  { id: 'waist_upper', label: 'Талия В' },
  { id: 'waist_lower', label: 'Талия Н' },
  { id: 'glutes', label: 'Ягодицы' },
  { id: 'thigh_r', label: 'Бедро П' },
  { id: 'thigh_l', label: 'Бедро Л' },
  { id: 'calf_r', label: 'Голень П' },
  { id: 'calf_l', label: 'Голень Л' },
]

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

