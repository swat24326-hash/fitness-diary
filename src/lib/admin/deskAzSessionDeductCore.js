/**
 * Списание занятий desk АЗ: журнал session_visits на абонементе + used_trainings.
 * Чистая логика без React / IDB. Не трогает дневник ПЗ и aerobic_sales_matrix напрямую.
 */

import { todayLocalIso } from '../dateRu.js'
import { membershipCoversDate, membershipHasRemaining } from '../membershipRules.js'
import { normalizeDeskHall } from './deskHallClientsCore.js'
import { pickHallActiveMembership } from './deskMembershipLedgerCore.js'

/**
 * @typedef {{ id: string, date: string, created_at: string, membership_type_id?: string }} DeskAzSessionVisit
 */

/**
 * @param {unknown} raw
 * @returns {DeskAzSessionVisit[]}
 */
export function normalizeSessionVisits(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {DeskAzSessionVisit[]} */
  const out = []
  for (const row of raw) {
    const id = String(row?.id ?? '').trim()
    const date = String(row?.date ?? '').slice(0, 10)
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const typeId = String(row?.membership_type_id ?? '').trim()
    out.push({
      id,
      date,
      created_at: String(row?.created_at ?? '') || `${date}T12:00:00.000Z`,
      ...(typeId ? { membership_type_id: typeId } : {}),
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
}

/**
 * Направление визита: снимок на момент списания, иначе текущий тип абона.
 * @param {DeskAzSessionVisit} visit
 * @param {object|null|undefined} membership
 */
export function resolveVisitMembershipTypeId(visit, membership) {
  const fromVisit = String(visit?.membership_type_id ?? '').trim()
  if (fromVisit) return fromVisit
  return String(membership?.membership_type_id ?? '').trim()
}

/**
 * @param {object|null|undefined} membership
 */
export function deskAzSessionUsage(membership) {
  const total = Math.max(0, Math.trunc(Number(membership?.total_trainings) || 0))
  const usedStored = Math.max(0, Math.trunc(Number(membership?.used_trainings) || 0))
  const visits = normalizeSessionVisits(membership?.session_visits)
  const used = Math.max(usedStored, visits.length)
  const remaining = total > 0 ? Math.max(0, total - used) : null
  const undatedUsed = Math.max(0, usedStored - visits.length)
  return { total, used, remaining, visits, undatedUsed }
}

/**
 * @param {object|null|undefined} membership
 * @param {string} [todayIso]
 */
export function canDeductDeskAzSession(membership, todayIso = todayLocalIso()) {
  if (!membership?.id) return { ok: false, error: 'Нет абонемента — сначала добавьте абон АЗ' }
  const total = Math.trunc(Number(membership.total_trainings) || 0)
  if (!(total > 0)) {
    return {
      ok: false,
      error: 'В абонементе не указан лимит занятий — откройте карточку и заполните «Занятий»',
    }
  }
  const usage = deskAzSessionUsage(membership)
  if (usage.remaining != null && usage.remaining <= 0) {
    return {
      ok: false,
      error: `Лимит исчерпан (${usage.used} из ${usage.total}) — нужен новый абон или отмена списания в журнале`,
    }
  }
  const day = String(todayIso ?? '').slice(0, 10)
  const start = String(membership.start_date ?? '').slice(0, 10)
  if (start && day < start) {
    return { ok: false, error: `Абонемент ещё не начался (с ${start})` }
  }
  if (!String(membership.membership_type_id ?? '').trim()) {
    return { ok: false, error: 'Не выбрано направление (Бокс / Степ…) — укажите в карточке абона' }
  }
  return { ok: true, usage }
}

/**
 * Дата списания в сроке абона (как у ПЗ: после конца — последний день).
 * @param {object} membership
 * @param {string} [preferredIso]
 */
export function resolveDeskAzDeductDate(membership, preferredIso = todayLocalIso()) {
  const today = String(preferredIso ?? '').slice(0, 10)
  const s = String(membership?.start_date ?? '').slice(0, 10)
  const e = String(membership?.end_date ?? '').slice(0, 10)
  if (s && today < s) return s
  if (e && today > e) return e
  return today || todayLocalIso()
}

/**
 * @param {object} membership
 * @param {{ date?: string, visitId?: string, nowIso?: string }} [opts]
 */
export function applyDeskAzSessionDeduct(membership, opts = {}) {
  const check = canDeductDeskAzSession(membership, opts.date || todayLocalIso())
  if (!check.ok) return { ok: false, error: check.error }

  const date = resolveDeskAzDeductDate(membership, opts.date || todayLocalIso())
  const s = String(membership.start_date ?? '').slice(0, 10)
  const e = String(membership.end_date ?? '').slice(0, 10)
  if (s && date < s) return { ok: false, error: 'Дата раньше начала абонемента' }
  if (e && date > e) return { ok: false, error: 'Дата позже окончания абонемента' }

  const typeId = String(membership.membership_type_id ?? '').trim()
  const visits = normalizeSessionVisits(membership.session_visits)
  /** @type {DeskAzSessionVisit} */
  const visit = {
    id: String(opts.visitId ?? '').trim() || cryptoRandomId(),
    date,
    created_at: String(opts.nowIso ?? new Date().toISOString()),
    membership_type_id: typeId,
  }
  const nextVisits = [visit, ...visits]
  const used = Math.max(0, Math.trunc(Number(membership.used_trainings) || 0)) + 1
  return {
    ok: true,
    membership: {
      ...membership,
      session_visits: nextVisits,
      used_trainings: used,
    },
    visit,
  }
}

/**
 * @param {object} membership
 * @param {string} visitId
 * @param {string} nextDate
 */
export function applyDeskAzSessionVisitDateChange(membership, visitId, nextDate) {
  const id = String(visitId ?? '').trim()
  const date = String(nextDate ?? '').slice(0, 10)
  if (!id) return { ok: false, error: 'Нет записи' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Некорректная дата' }
  const s = String(membership?.start_date ?? '').slice(0, 10)
  const e = String(membership?.end_date ?? '').slice(0, 10)
  if (s && date < s) return { ok: false, error: 'Дата раньше начала абонемента' }
  if (e && date > e) return { ok: false, error: 'Дата позже окончания абонемента' }

  const visits = normalizeSessionVisits(membership?.session_visits)
  const idx = visits.findIndex((v) => v.id === id)
  if (idx < 0) return { ok: false, error: 'Запись не найдена' }
  const nextVisits = visits.map((v, i) => (i === idx ? { ...v, date } : v))
  return {
    ok: true,
    membership: {
      ...membership,
      session_visits: normalizeSessionVisits(nextVisits),
    },
  }
}

/**
 * @param {object} membership
 * @param {string} visitId
 */
export function applyDeskAzSessionVisitRemove(membership, visitId) {
  const id = String(visitId ?? '').trim()
  if (!id) return { ok: false, error: 'Нет записи' }
  const visits = normalizeSessionVisits(membership?.session_visits)
  const nextVisits = visits.filter((v) => v.id !== id)
  if (nextVisits.length === visits.length) return { ok: false, error: 'Запись не найдена' }
  const used = Math.max(0, Math.trunc(Number(membership.used_trainings) || 0) - 1)
  return {
    ok: true,
    membership: {
      ...membership,
      session_visits: nextVisits,
      used_trainings: used,
    },
  }
}

/**
 * Подпись остатка для списка/карточки.
 * @param {object|null|undefined} membership
 */
export function formatDeskAzSessionUsageRu(membership) {
  const u = deskAzSessionUsage(membership)
  if (!(u.total > 0)) return '—'
  return `${u.used} из ${u.total}`
}

/**
 * Агрегат списаний АЗ за день по направлениям (для подсказки в дневном отчёте).
 * Тип берём из визита (снимок), иначе с абона — для старых записей.
 * @param {object[]} memberships
 * @param {object[]} clients — для фильтра desk_hall=az
 * @param {string} dayIso
 * @returns {Array<{ membership_type_id: string, count: number }>}
 */
export function aggregateDeskAzSessionsForDay(memberships, clients, dayIso) {
  const day = String(dayIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return []

  /** @type {Set<string>} */
  const azClientIds = new Set()
  for (const c of clients ?? []) {
    if (normalizeDeskHall(c?.desk_hall) !== 'az') continue
    const id = String(c?.id ?? '').trim()
    if (id) azClientIds.add(id)
  }

  /** @type {Map<string, number>} */
  const byType = new Map()
  for (const m of memberships ?? []) {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid || !azClientIds.has(cid)) continue
    for (const v of normalizeSessionVisits(m?.session_visits)) {
      if (v.date !== day) continue
      const typeId = resolveVisitMembershipTypeId(v, m)
      if (!typeId) continue
      byType.set(typeId, (byType.get(typeId) || 0) + 1)
    }
  }

  return [...byType.entries()]
    .map(([membership_type_id, count]) => ({ membership_type_id, count }))
    .filter((r) => r.count > 0)
    .sort((a, b) => a.membership_type_id.localeCompare(b.membership_type_id))
}

/**
 * Слить подсказку списаний в inputMap матрицы АЗ (не затирает большие ручные значения вниз).
 * @param {Record<string, string>} inputMap
 * @param {Array<{ membership_type_id: string, count: number }>} fromSessions
 * @returns {Record<string, string>}
 */
export function mergeAerobicMatrixWithAzSessionCounts(inputMap, fromSessions) {
  const next = { ...(inputMap ?? {}) }
  for (const row of fromSessions ?? []) {
    const key = String(row?.membership_type_id ?? '').trim()
    if (!key) continue
    const suggest = Math.max(0, Math.trunc(Number(row?.count) || 0))
    const cur = Math.max(0, Math.trunc(Number(String(next[key] ?? '').replace(/\s/g, '')) || 0))
    next[key] = String(Math.max(cur, suggest))
  }
  return next
}

/**
 * Только пустые / нулевые ячейки — для автоподстановки при открытии дня.
 * Уже введённые числа менеджера не трогаем.
 * @param {Record<string, string>} inputMap
 * @param {Array<{ membership_type_id: string, count: number }>} fromSessions
 */
export function fillEmptyAerobicMatrixFromAzSessions(inputMap, fromSessions) {
  const next = { ...(inputMap ?? {}) }
  let filled = 0
  for (const row of fromSessions ?? []) {
    const key = String(row?.membership_type_id ?? '').trim()
    if (!key) continue
    const suggest = Math.max(0, Math.trunc(Number(row?.count) || 0))
    if (suggest <= 0) continue
    const raw = String(next[key] ?? '').trim()
    const cur = Math.max(0, Math.trunc(Number(raw.replace(/\s/g, '')) || 0))
    if (raw !== '' && cur > 0) continue
    next[key] = String(suggest)
    filled += 1
  }
  return { matrix: next, filledCells: filled }
}

/**
 * Сколько занятий из списаний ещё не покрыто матрицей (по направлениям).
 * @param {Record<string, string>} inputMap
 * @param {Array<{ membership_type_id: string, count: number }>} fromSessions
 */
export function countUnaccountedAzSessionSlots(inputMap, fromSessions) {
  let n = 0
  for (const row of fromSessions ?? []) {
    const key = String(row?.membership_type_id ?? '').trim()
    if (!key) continue
    const suggest = Math.max(0, Math.trunc(Number(row?.count) || 0))
    const cur = Math.max(0, Math.trunc(Number(String(inputMap?.[key] ?? '').replace(/\s/g, '')) || 0))
    if (suggest > cur) n += suggest - cur
  }
  return n
}

/**
 * Действующий АЗ-абон клиента для кнопки списания в списке.
 * @param {object[]} memberships
 * @param {string} [todayIso]
 */
export function pickAzMembershipForDeduct(memberships, todayIso = todayLocalIso()) {
  const active = pickHallActiveMembership(memberships, todayIso, 'az')
  if (active && membershipHasRemaining(active) && membershipCoversDate(active, todayIso)) {
    return active
  }
  return active
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `v-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
