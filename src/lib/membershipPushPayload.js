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
  // В public.memberships нет updated_at — локальные поля ломают PostgREST schema cache.
  delete next.updated_at

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

  if (Object.prototype.hasOwnProperty.call(next, 'paid_amount')) {
    const raw = next.paid_amount
    if (raw === null || raw === undefined || raw === '') {
      next.paid_amount = null
    } else {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: 'Цена абонемента должна быть числом ≥ 0' }
      }
      next.paid_amount = Math.round(n * 100) / 100
    }
  }

  if (Object.prototype.hasOwnProperty.call(next, 'session_visits')) {
    const raw = next.session_visits
    if (raw == null) {
      next.session_visits = []
    } else if (!Array.isArray(raw)) {
      return { ok: false, error: 'Журнал списаний АЗ должен быть списком' }
    } else {
      const visits = []
      for (const row of raw) {
        const id = String(row?.id ?? '').trim()
        const date = String(row?.date ?? '').slice(0, 10)
        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return { ok: false, error: 'Журнал списаний АЗ: нужен id и дата' }
        }
        const typeId = String(row?.membership_type_id ?? '').trim()
        visits.push({
          id,
          date,
          created_at: String(row?.created_at ?? '') || `${date}T12:00:00.000Z`,
          ...(typeId ? { membership_type_id: typeId } : {}),
        })
      }
      next.session_visits = visits
    }
  }

  if (Object.prototype.hasOwnProperty.call(next, 'hall')) {
    const h = String(next.hall ?? '')
      .trim()
      .toLowerCase()
    if (h === 'pz' || h === 'tz' || h === 'az') {
      next.hall = h
    } else if (!insert) {
      delete next.hall
    } else {
      next.hall = 'pz'
    }
  } else if (insert) {
    next.hall = 'pz'
  }

  return { ok: true, data: next }
}
