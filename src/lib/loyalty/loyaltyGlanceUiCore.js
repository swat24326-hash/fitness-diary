/**
 * Чип / вкладка лояльности: пачки glance, кому показывать, тексты.
 * Без React / fetch / IDB.
 */

import { isDeskHallClient } from '../admin/holdingClientsCore.js'
import { isOpenPnkClient } from '../pnk/pnkStagesCore.js'

export const LOYALTY_GLANCE_FETCH_BATCH = 80
export const LOYALTY_IDLE_NO_VISITS = 'нет завершённых в дневнике'
export const LOYALTY_PROGRAM_OFF = 'программа в клубе выключена'
export const LOYALTY_MISSED_WEEK = 'пропущена неделя — пачка 0'

/**
 * @param {unknown} ids
 * @param {number} [size]
 * @returns {string[][]}
 */
export function chunkLoyaltyGlanceIds(ids, size = LOYALTY_GLANCE_FETCH_BATCH) {
  const n = Number(size)
  const batch = Number.isFinite(n) && n > 0 ? Math.floor(n) : LOYALTY_GLANCE_FETCH_BATCH
  const list = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x ?? '').trim()).filter(Boolean))]
  const out = []
  for (let i = 0; i < list.length; i += batch) out.push(list.slice(i, i + batch))
  return out
}

/**
 * Клиент в программе куша: ПЗ (в т.ч. lite). Не ТЗ/АЗ и не открытый ПНК.
 * Одна правда для вкладки, чипа и штампа в дневнике.
 * @param {object | null | undefined} client
 */
export function isLoyaltyProgramClient(client) {
  if (!client) return false
  if (isDeskHallClient(client)) return false
  if (isOpenPnkClient(client)) return false
  return true
}

/** Поверхность UI = тот же контур, что программа. */
export function shouldShowLoyaltyUi(client) {
  return isLoyaltyProgramClient(client)
}

/**
 * @param {object | null | undefined} snapshot
 */
export function isLoyaltySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  return snapshot.state === 'idle' || snapshot.state === 'active'
}

/**
 * Last-good: живой ответ важнее кэша; пустой ответ не затирает кэш.
 * @param {object | null | undefined} cached
 * @param {object | null | undefined} live
 */
export function pickLoyaltyLastGood(cached, live) {
  if (isLoyaltySnapshot(live)) return live
  if (isLoyaltySnapshot(cached)) return cached
  return null
}

/**
 * @param {object | null | undefined} snapshot
 * @returns {{ show: boolean, label: string, value: string, title: string, tone: 'idle' | 'active' | 'missed' }}
 */
export function formatLoyaltyGlanceChip(snapshot) {
  if (!isLoyaltySnapshot(snapshot)) {
    return { show: false, label: 'Баллы', value: '', title: '', tone: 'idle' }
  }
  const points = Number(snapshot.points)
  const value = Number.isFinite(points) ? String(Math.max(0, Math.round(points))) : '0'
  const missed = snapshot.missed_open_week === true
  const title = missed ? LOYALTY_MISSED_WEEK : `Баллы: ${value}`
  return {
    show: true,
    label: 'Баллы',
    value,
    title,
    tone: missed ? 'missed' : snapshot.state === 'active' ? 'active' : 'idle',
  }
}

/**
 * @param {object | null | undefined} snapshot
 */
export function formatLoyaltyAccountCopy(snapshot) {
  if (!isLoyaltySnapshot(snapshot)) {
    return {
      points: 0,
      weeks_credited: 0,
      kcal_remainder: 0,
      cycle_start: null,
      unlock_on: null,
      can_redeem: false,
      hint: '',
      enabled: false,
      state: 'idle',
      missed_open_week: false,
    }
  }
  const points = Number(snapshot.points)
  const weeks = Number(snapshot.weeks_credited)
  const rem = Number(snapshot.kcal_remainder)
  const enabled = snapshot.enabled === true
  let hint = ''
  if (!enabled) hint = LOYALTY_PROGRAM_OFF
  else if (snapshot.missed_open_week === true) hint = LOYALTY_MISSED_WEEK
  else if (snapshot.state === 'idle' && (!Number.isFinite(points) || points === 0)) {
    hint = LOYALTY_IDLE_NO_VISITS
  }
  return {
    points: Number.isFinite(points) ? Math.max(0, Math.round(points)) : 0,
    weeks_credited: Number.isFinite(weeks) ? Math.max(0, Math.round(weeks)) : 0,
    kcal_remainder: Number.isFinite(rem) ? Math.max(0, Math.round(rem)) : 0,
    cycle_start: snapshot.cycle_start ?? null,
    unlock_on: snapshot.unlock_on ?? null,
    can_redeem: snapshot.can_redeem === true,
    hint,
    enabled,
    state: snapshot.state,
    missed_open_week: snapshot.missed_open_week === true,
  }
}

/**
 * Поля снимка §12 + client_id / saved_at для IDB.
 * @param {string} clientId
 * @param {object} snapshot
 * @param {number} [savedAt]
 */
export function loyaltyGlanceCacheRow(clientId, snapshot, savedAt = Date.now()) {
  const id = String(clientId ?? '').trim()
  const s = isLoyaltySnapshot(snapshot) ? snapshot : null
  if (!id || !s) return null
  return {
    client_id: id,
    enabled: s.enabled === true,
    state: s.state,
    points: Number(s.points) || 0,
    kcal_remainder: Number(s.kcal_remainder) || 0,
    weeks_credited: Number(s.weeks_credited) || 0,
    cycle_start: s.cycle_start ?? null,
    unlock_on: s.unlock_on ?? null,
    can_redeem: s.can_redeem === true,
    missed_open_week: s.missed_open_week === true,
    as_of: s.as_of ?? '',
    saved_at: savedAt,
  }
}

/** @param {object | null | undefined} row */
export function loyaltySnapshotFromCacheRow(row) {
  if (!row || typeof row !== 'object') return null
  if (row.state !== 'idle' && row.state !== 'active') return null
  return {
    enabled: row.enabled === true,
    state: row.state,
    points: Number(row.points) || 0,
    kcal_remainder: Number(row.kcal_remainder) || 0,
    weeks_credited: Number(row.weeks_credited) || 0,
    cycle_start: row.cycle_start ?? null,
    unlock_on: row.unlock_on ?? null,
    can_redeem: row.can_redeem === true,
    missed_open_week: row.missed_open_week === true,
    as_of: row.as_of ?? '',
  }
}
