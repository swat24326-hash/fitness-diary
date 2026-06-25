/** Допустимые значения trainings.type в Postgres (см. schema.sql / migrations). */
export const DB_TRAINING_TYPES = new Set(['Силовая', 'Функциональная', 'Кардио', 'Смешанная', 'Списание'])

/**
 * Привести строку trainings к ограничению БД.
 * «Списание (неявка)» хранится в data.is_writeoff + training_focus; type — «Силовая».
 */
export function normalizeTrainingPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const row = { ...payload }
  const data = row.data && typeof row.data === 'object' ? { ...row.data } : {}
  const type = String(row.type ?? '').trim()

  if (type === 'Списание' || data.is_writeoff === true) {
    row.type = 'Силовая'
    data.is_writeoff = true
    if (!String(data.training_focus ?? '').trim()) {
      data.training_focus = 'Списание (неявка)'
    }
    row.data = data
  } else if (!DB_TRAINING_TYPES.has(type)) {
    row.type = 'Силовая'
    row.data = data
  } else {
    row.data = data
  }

  if (row.status != null) {
    const st = String(row.status).trim()
    if (st !== 'draft' && st !== 'completed') {
      row.status = 'completed'
    }
  }

  return row
}
