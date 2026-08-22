/** Допустимые значения trainings.type в Postgres (см. schema.sql / migrations). */
export const DB_TRAINING_TYPES = new Set(['Силовая', 'Функциональная', 'Кардио', 'Смешанная', 'Списание'])

/** Колонки public.trainings (без локальных synced/__sync). */
export const TRAINING_PUSH_COLUMNS = Object.freeze([
  'id',
  'client_id',
  'trainer_id',
  'club_id',
  'date',
  'type',
  'status',
  'data',
  'created_at',
  'updated_at',
])

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

/**
 * Payload для insert/update trainings: allowlist + серверный updated_at.
 * @param {object} payload
 * @param {{ operation?: string, nowIso?: string }} [opts]
 * @returns {object | null}
 */
export function prepareTrainingPushPayload(payload, opts = {}) {
  const normalized = normalizeTrainingPayload(payload)
  if (!normalized || typeof normalized !== 'object') return null

  const nowIso =
    typeof opts.nowIso === 'string' && opts.nowIso.trim()
      ? opts.nowIso.trim()
      : new Date().toISOString()
  const operation = String(opts.operation ?? '').trim()

  const next = {}
  for (const key of TRAINING_PUSH_COLUMNS) {
    if (normalized[key] !== undefined) next[key] = normalized[key]
  }
  next.updated_at = nowIso
  if (operation === 'update') {
    delete next.created_at
  }
  return next
}

/** Ошибка «нет колонки updated_at» — откат до миграции. */
export function isMissingTrainingsUpdatedAtError(message) {
  const msg = String(message ?? '')
  return /updated_at/i.test(msg) && /schema cache|could not find|column/i.test(msg)
}

/**
 * Убрать updated_at из payload (старый прод без колонки).
 * @param {object} payload
 */
export function stripTrainingUpdatedAt(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const next = { ...payload }
  delete next.updated_at
  return next
}
