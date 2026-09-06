/**
 * Расписание тренера: нормализация, сетка месяца, отображение слотов.
 */
import { addDaysToIso } from '../dateRu.js'

/** Сетка дня: полные сутки (часы 00…23). END exclusive. */
export const SCHEDULE_DAY_START_HOUR = 0
export const SCHEDULE_DAY_END_HOUR = 24
/** При открытии дня скролл к этому часу (ночные слоты выше по скроллу). */
export const SCHEDULE_DAY_FOCUS_HOUR = 7
export const SCHEDULE_DEFAULT_DURATION_MIN = 60
export const SCHEDULE_MAX_CLIENTS = 10
export const SCHEDULE_PULL_DAYS_BACK = 30
export const SCHEDULE_PULL_DAYS_FORWARD = 120

/** Режимы календаря тренера / админа. */
export const SCHEDULE_VIEW_DAY = 'day'
export const SCHEDULE_VIEW_DAYS3 = 'days3'
export const SCHEDULE_VIEW_WEEK = 'week'
export const SCHEDULE_VIEW_MONTH = 'month'

const WEEKDAY_LABELS_RU = Object.freeze(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'])

/** @param {unknown} value @param {number} fallback @param {number} min @param {number} max */
function clampInt(value, fallback, min, max) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** @param {unknown} raw */
export function normalizeScheduleClientIds(raw) {
  let list = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const id = String(item ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= SCHEDULE_MAX_CLIENTS) break
  }
  return out
}

/** @param {unknown} raw */
export function normalizeTrainerScheduleEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (raw)
  const id = String(r.id ?? '').trim()
  const clubId = String(r.club_id ?? '').trim()
  const trainerId = String(r.trainer_id ?? '').trim()
  const dayDate = String(r.day_date ?? '').slice(0, 10)
  if (!id || !clubId || !trainerId || !/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) return null

  const startMinutes = clampInt(r.start_minutes, 9 * 60, 0, 23 * 60 + 59)
  const durationMinutes = clampInt(r.duration_minutes, SCHEDULE_DEFAULT_DURATION_MIN, 15, 480)
  const title = String(r.title ?? '').trim().slice(0, 240)
  const clientIds = normalizeScheduleClientIds(r.client_ids)
  const linkedTrainingId = String(r.linked_training_id ?? '').trim() || null

  if (!title && !clientIds.length) return null

  return {
    id,
    club_id: clubId,
    trainer_id: trainerId,
    day_date: dayDate,
    start_minutes: startMinutes,
    duration_minutes: durationMinutes,
    title,
    client_ids: clientIds,
    linked_training_id: linkedTrainingId,
    created_at: String(r.created_at ?? new Date().toISOString()),
    updated_at: String(r.updated_at ?? new Date().toISOString()),
    synced: r.synced !== false,
  }
}

/** @param {number} minutes */
export function formatScheduleMinutes(minutes) {
  const m = clampInt(minutes, 0, 0, 1439)
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** @param {string} hhmm */
export function parseScheduleTimeToMinutes(hhmm) {
  const raw = String(hhmm ?? '').trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** @param {{ start_minutes: number, duration_minutes: number }} entry */
export function formatScheduleTimeRange(entry) {
  const start = Number(entry?.start_minutes) || 0
  const end = start + (Number(entry?.duration_minutes) || SCHEDULE_DEFAULT_DURATION_MIN)
  return `${formatScheduleMinutes(start)}–${formatScheduleMinutes(Math.min(end, 1439))}`
}

/**
 * @param {object} entry
 * @param {Record<string, string>} [clientNameById]
 */
export function buildScheduleEntryLabel(entry, clientNameById = {}) {
  const ids = normalizeScheduleClientIds(entry?.client_ids)
  if (ids.length) {
    const names = ids
      .map((id) => String(clientNameById[id] ?? '').trim())
      .filter(Boolean)
    if (names.length === 1) return names[0]
    if (names.length > 1) return names.join(', ')
    if (ids.length === 1) return 'Клиент'
    return `${ids.length} клиента`
  }
  const title = String(entry?.title ?? '').trim()
  return title || 'Заметка'
}

/**
 * @param {number} year  @param {number} month 1–12
 */
export function buildScheduleMonthGrid(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return { year: y, month: m, weeks: [], weekdayLabels: WEEKDAY_LABELS_RU }
  }
  const first = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  const mondayIndex = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < mondayIndex; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(m).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    cells.push({ day, iso: `${y}-${mm}-${dd}`, inMonth: true })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return { year: y, month: m, weeks, weekdayLabels: WEEKDAY_LABELS_RU }
}

/** @param {object[]} entries @param {string} dayIso */
export function filterScheduleEntriesForDay(entries, dayIso) {
  const day = String(dayIso ?? '').slice(0, 10)
  return (entries ?? [])
    .filter((e) => String(e?.day_date ?? '').slice(0, 10) === day)
    .sort((a, b) => (a.start_minutes - b.start_minutes) || String(a.id).localeCompare(String(b.id)))
}

/** @param {string} dayIso YYYY-MM-DD */
export function startOfWeekMondayIso(dayIso) {
  const day = String(dayIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const mondayOffset = (dt.getDay() + 6) % 7
  return addDaysToIso(day, -mondayOffset)
}

/** @param {string} dayIso YYYY-MM-DD */
export function weekdayShortRu(dayIso) {
  const day = String(dayIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return WEEKDAY_LABELS_RU[(dt.getDay() + 6) % 7] ?? ''
}

/**
 * Дни в окне режима: день / 3 дня от якоря / пн–вс недели якоря.
 * @param {string} anchorIso
 * @param {string} view
 * @returns {string[]}
 */
export function listScheduleViewDays(anchorIso, view) {
  const anchor = String(anchorIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return []
  const mode = String(view ?? SCHEDULE_VIEW_DAY)
  if (mode === SCHEDULE_VIEW_WEEK) {
    const monday = startOfWeekMondayIso(anchor)
    return Array.from({ length: 7 }, (_, i) => addDaysToIso(monday, i))
  }
  if (mode === SCHEDULE_VIEW_DAYS3) {
    return [anchor, addDaysToIso(anchor, 1), addDaysToIso(anchor, 2)]
  }
  return [anchor]
}

/**
 * Сдвиг якоря: день ±1, 3 дня ±3, неделя ±7.
 * @param {string} anchorIso
 * @param {string} view
 * @param {number} delta  обычно −1 | +1
 */
export function shiftScheduleAnchorIso(anchorIso, view, delta) {
  const anchor = String(anchorIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return anchor
  const step = Number(delta) || 0
  const mode = String(view ?? SCHEDULE_VIEW_DAY)
  if (mode === SCHEDULE_VIEW_WEEK) return addDaysToIso(anchor, step * 7)
  if (mode === SCHEDULE_VIEW_DAYS3) return addDaysToIso(anchor, step * 3)
  return addDaysToIso(anchor, step)
}

/**
 * Заголовок диапазона: одна дата или «дд.мм – дд.мм.гггг».
 * @param {string[]} dayIsos
 * @param {(iso: string) => string} formatDay
 */
export function formatScheduleViewRangeLabel(dayIsos, formatDay) {
  const days = (dayIsos ?? []).map((d) => String(d ?? '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (!days.length) return '—'
  const fmt = typeof formatDay === 'function' ? formatDay : (iso) => iso
  if (days.length === 1) return fmt(days[0])
  const first = days[0]
  const last = days[days.length - 1]
  const a = fmt(first)
  const b = fmt(last)
  if (a.length >= 10 && b.length >= 10 && a.slice(6) === b.slice(6)) {
    return `${a.slice(0, 5)} – ${b}`
  }
  return `${a} – ${b}`
}

/**
 * Колонки для пересекающихся слотов (режим «Все тренеры»).
 * @param {object[]} entries
 * @returns {Map<string, { lane: number, laneCount: number }>}
 */
export function assignScheduleEntryLanes(entries) {
  const list = [...(entries ?? [])].sort(
    (a, b) =>
      Number(a?.start_minutes ?? 0) - Number(b?.start_minutes ?? 0) ||
      String(a?.id ?? '').localeCompare(String(b?.id ?? '')),
  )
  /** @type {Map<string, { lane: number, laneCount: number }>} */
  const out = new Map()
  if (!list.length) return out

  const startOf = (e) => Number(e?.start_minutes) || 0
  const endOf = (e) => startOf(e) + (Number(e?.duration_minutes) || SCHEDULE_DEFAULT_DURATION_MIN)

  /** @type {number[]} */
  const laneEnds = []
  /** @type {{ id: string, start: number, end: number, lane: number }[]} */
  const placed = []
  for (const e of list) {
    const id = String(e?.id ?? '').trim()
    if (!id) continue
    const start = startOf(e)
    const end = endOf(e)
    let lane = 0
    while (lane < laneEnds.length && laneEnds[lane] > start) lane += 1
    if (lane === laneEnds.length) laneEnds.push(end)
    else laneEnds[lane] = end
    placed.push({ id, start, end, lane })
  }

  const n = placed.length
  const clusterOf = new Array(n).fill(-1)
  let clusterCount = 0
  for (let i = 0; i < n; i++) {
    if (clusterOf[i] >= 0) continue
    const queue = [i]
    clusterOf[i] = clusterCount
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q]
      for (let j = 0; j < n; j++) {
        if (clusterOf[j] >= 0) continue
        if (placed[cur].start < placed[j].end && placed[j].start < placed[cur].end) {
          clusterOf[j] = clusterCount
          queue.push(j)
        }
      }
    }
    clusterCount += 1
  }

  const clusterWidth = new Array(clusterCount).fill(1)
  for (let i = 0; i < n; i++) {
    const c = clusterOf[i]
    clusterWidth[c] = Math.max(clusterWidth[c], placed[i].lane + 1)
  }

  for (let i = 0; i < n; i++) {
    out.set(placed[i].id, { lane: placed[i].lane, laneCount: clusterWidth[clusterOf[i]] })
  }
  return out
}

/** @param {object[]} entries @param {number} year @param {number} month */
export function countScheduleEntriesByDay(entries, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  /** @type {Record<string, number>} */
  const map = {}
  for (const e of entries ?? []) {
    const day = String(e?.day_date ?? '').slice(0, 10)
    if (!day.startsWith(prefix)) continue
    map[day] = (map[day] ?? 0) + 1
  }
  return map
}

/**
 * Локальные id в окне pull, которых нет в remote — удалить (не pending).
 * @param {object[]} localRows
 * @param {object[]} remoteRows
 * @param {string} trainerId
 * @param {Set<string>} pendingIds
 * @param {{ dayFrom: string, dayTo: string }} window
 */
export function planTrainerSchedulePrune(localRows, remoteRows, trainerId, pendingIds, window) {
  const tid = String(trainerId ?? '').trim()
  const from = String(window?.dayFrom ?? '').slice(0, 10)
  const to = String(window?.dayTo ?? '').slice(0, 10)
  if (!tid || !from || !to) return []
  const remoteIds = new Set((remoteRows ?? []).map((r) => String(r?.id ?? '').trim()).filter(Boolean))
  const out = []
  for (const row of localRows ?? []) {
    if (String(row?.trainer_id ?? '') !== tid) continue
    const id = String(row?.id ?? '').trim()
    if (!id || remoteIds.has(id) || pendingIds?.has(id)) continue
    const day = String(row?.day_date ?? '').slice(0, 10)
    if (day >= from && day <= to) out.push(id)
  }
  return out
}

/** @param {object[]} [syncQueueItems] */
export function buildPendingTrainerScheduleKeys(syncQueueItems) {
  const pendingUpdates = new Set()
  const pendingInserts = new Set()
  for (const item of syncQueueItems ?? []) {
    if (item.table_name !== 'trainer_schedule_entries') continue
    if (item.operation === 'insert') {
      const id = String(item.data?.id ?? '').trim()
      if (id) pendingInserts.add(id)
      continue
    }
    if (item.operation === 'update' || item.operation === 'delete') {
      const id = String(item.remote_id ?? item.data?.id ?? '').trim()
      if (id) pendingUpdates.add(id)
    }
  }
  return { pendingUpdates, pendingInserts }
}

/** @param {string} todayIso YYYY-MM-DD */
export function resolveTrainerSchedulePullWindow(todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return { dayFrom: today, dayTo: today }
  }
  return {
    dayFrom: addDaysToIso(today, -SCHEDULE_PULL_DAYS_BACK),
    dayTo: addDaysToIso(today, SCHEDULE_PULL_DAYS_FORWARD),
  }
}

/**
 * Поиск клиента в модалке ежедневника — как в списке клиентов тренера.
 * @param {object | null | undefined} client
 * @param {string} query
 */
export function clientMatchesTrainerScheduleSearch(client, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  const name = String(client?.name ?? '').toLowerCase()
  const phone = String(client?.phone ?? '').toLowerCase()
  const card = String(client?.card_number ?? '').toLowerCase()
  return name.includes(q) || phone.includes(q) || card.includes(q)
}

/**
 * Список для выбора: выбранные остаются видимыми даже при фильтре.
 * @param {object[]} clients
 * @param {string} query
 * @param {string[]} [selectedIds]
 */
export function buildTrainerScheduleClientPickerList(clients, query, selectedIds = []) {
  const list = Array.isArray(clients) ? clients : []
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return list
  const selectedSet = new Set((selectedIds ?? []).map((id) => String(id)))
  const matched = list.filter((c) => clientMatchesTrainerScheduleSearch(c, q))
  const pinned = list.filter(
    (c) => selectedSet.has(String(c.id)) && !matched.some((m) => String(m.id) === String(c.id)),
  )
  return [...pinned, ...matched]
}

/** Ежедневник — не перезагружать UI из‑за статуса очереди sync и чужих справочников. */
export function shouldReloadTrainerScheduleData(detail = {}) {
  const reason = String(detail?.reason ?? '')
  if (reason === 'sync-queue') return false
  if (reason === 'exercises') return false
  if (
    reason === 'challenge-trainings' ||
    reason === 'challenge-created' ||
    reason === 'challenge-deleted' ||
    reason === 'challenge-completed'
  ) {
    return false
  }
  if (reason === 'loyalty-glance' || reason === 'clubs-refresh' || reason === 'admin-clients-cache') {
    return false
  }
  if (!reason) return true
  if (reason === 'sync-complete' || reason === 'trainer-schedule') return true
  if (reason === 'client-deleted' || reason === 'trainer-club-cascade') return true
  if (reason === 'client-hydrated' || reason === 'memberships-refreshed') return true
  return false
}
