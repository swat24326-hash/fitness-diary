/**
 * Ежедневники тренеров — доступ админа / управляющего, окно месяца.
 */

const MAX_RANGE_DAYS = 366

/** @param {string} iso */
function parseIsoDay(iso) {
  const day = String(iso ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
}

/**
 * @param {{ isAdmin?: boolean, isSupervisor?: boolean, profileClub?: string, requestedClubId?: string }} ctx
 * @returns {{ ok: true, clubId: string } | { ok: false, error: string, status?: number }}
 */
export function resolveTrainerScheduleAdminClubId(ctx) {
  const requested = String(ctx?.requestedClubId ?? '').trim()
  if (ctx?.isSupervisor && !ctx?.isAdmin) {
    const profileClub = String(ctx?.profileClub ?? '').trim()
    if (!profileClub) {
      return { ok: false, error: 'У управляющего не задан club_id — обратитесь к администратору', status: 403 }
    }
    if (requested && requested !== profileClub) {
      return { ok: false, error: 'Нет доступа к этому клубу', status: 403 }
    }
    return { ok: true, clubId: profileClub }
  }
  if (!requested) {
    return { ok: false, error: 'Укажите club_id' }
  }
  return { ok: true, clubId: requested }
}

/**
 * @param {number} year
 * @param {number} month 1–12
 * @returns {{ dayFrom: string, dayTo: string } | null}
 */
export function resolveScheduleMonthWindow(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  const mm = String(m).padStart(2, '0')
  const daysInMonth = new Date(y, m, 0).getDate()
  return {
    dayFrom: `${y}-${mm}-01`,
    dayTo: `${y}-${mm}-${String(daysInMonth).padStart(2, '0')}`,
  }
}

/**
 * @param {string} dayFrom
 * @param {string} dayTo
 * @returns {{ ok: true, dayFrom: string, dayTo: string } | { ok: false, error: string }}
 */
export function validateTrainerScheduleDateRange(dayFrom, dayTo) {
  const from = parseIsoDay(dayFrom)
  const to = parseIsoDay(dayTo)
  if (!from || !to || from > to) {
    return { ok: false, error: 'Укажите day_from и day_to (YYYY-MM-DD)' }
  }
  const start = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  if (spanDays > MAX_RANGE_DAYS) {
    return { ok: false, error: `Интервал не больше ${MAX_RANGE_DAYS} дней` }
  }
  return { ok: true, dayFrom: from, dayTo: to }
}

/** @param {object[]} entries */
export function collectScheduleClientIds(entries) {
  const out = new Set()
  for (const entry of entries ?? []) {
    let ids = entry?.client_ids
    if (typeof ids === 'string') {
      try {
        ids = JSON.parse(ids)
      } catch {
        ids = []
      }
    }
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      const cid = String(id ?? '').trim()
      if (cid) out.add(cid)
    }
  }
  return [...out]
}

/** @param {object[]} entries */
export function collectScheduleTrainerIds(entries) {
  const out = new Set()
  for (const entry of entries ?? []) {
    const tid = String(entry?.trainer_id ?? '').trim()
    if (tid) out.add(tid)
  }
  return [...out]
}

/** @param {object[]} entries */
export function collectScheduleLinkedTrainingIds(entries) {
  const out = new Set()
  for (const entry of entries ?? []) {
    const tid = String(entry?.linked_training_id ?? '').trim()
    if (tid) out.add(tid)
  }
  return [...out]
}

/**
 * @param {Array<{ id?: string, name?: string }>} trainers
 * @returns {Record<string, string>}
 */
export function buildTrainerNameById(trainers) {
  /** @type {Record<string, string>} */
  const map = {}
  for (const t of trainers ?? []) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    map[id] = String(t?.name ?? '').trim() || 'Тренер'
  }
  return map
}

/**
 * @param {Array<{ id?: string, name?: string }>} clients
 * @returns {Record<string, string>}
 */
export function buildScheduleClientNameById(clients) {
  /** @type {Record<string, string>} */
  const map = {}
  for (const c of clients ?? []) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    map[id] = String(c?.name ?? '').trim() || 'Клиент'
  }
  return map
}
