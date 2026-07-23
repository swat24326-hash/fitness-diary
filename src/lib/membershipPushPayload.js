/**
 * Нормализация payload memberships для push в Supabase (без React/IDB).
 * start_date / end_date в БД NOT NULL — пустые значения нельзя слать как null.
 */

function isoDateOrEmpty(value) {
  const s = String(value ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/**
 * @param {object} payload
 * @param {{ insert?: boolean }} [opts]
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function normalizeMembershipPushPayload(payload, { insert = false } = {}) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Некорректный абонемент' }
  }

  const next = { ...payload }

  for (const key of ['start_date', 'end_date']) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue
    const d = isoDateOrEmpty(next[key])
    if (d) {
      next[key] = d
      continue
    }
    // update: не затирать NOT NULL в облаке пустым значением (списание used_trainings и т.п.)
    if (!insert) {
      delete next[key]
      continue
    }
    delete next[key]
  }

  if (insert) {
    if (!isoDateOrEmpty(next.start_date)) {
      return { ok: false, error: 'Укажите дату начала абонемента' }
    }
    if (!isoDateOrEmpty(next.end_date)) {
      return { ok: false, error: 'Укажите дату окончания абонемента' }
    }
  }

  const start = isoDateOrEmpty(next.start_date)
  const end = isoDateOrEmpty(next.end_date)
  if (start && end && end < start) {
    return { ok: false, error: 'Дата окончания не может быть раньше начала' }
  }

  return { ok: true, data: next }
}
