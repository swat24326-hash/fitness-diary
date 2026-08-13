/**
 * Сводка по журналам клубной связи (звонки / SMS) — чистые правила.
 * Источник: наши club_*_log (команда API ok|fail), не полный кабинет Мои Звонки.
 */

import { normalizeClubCallLogStatus } from './clubCallLogCore.js'
import { normalizeClubSmsLogStatus } from './clubSmsLogCore.js'

/**
 * @param {string | null | undefined} iso
 */
export function outreachLogDayKey(iso) {
  const s = String(iso ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/**
 * @param {Array<{ status?: string, created_at?: string, sent_by?: string | null, sent_by_name?: string | null, client_id?: string }>} logs
 * @param {{ normalizeStatus?: (raw: unknown) => 'ok' | 'fail' }} [opts]
 */
export function buildClubOutreachStats(logs, opts = {}) {
  const normalize =
    typeof opts.normalizeStatus === 'function' ? opts.normalizeStatus : normalizeClubCallLogStatus

  let ok = 0
  let fail = 0
  /** @type {Map<string, { day: string, ok: number, fail: number, total: number }>} */
  const byDayMap = new Map()
  /** @type {Map<string, { key: string, name: string, ok: number, fail: number, total: number }>} */
  const bySenderMap = new Map()
  /** @type {Set<string>} */
  const clients = new Set()

  for (const row of logs ?? []) {
    const status = normalize(row?.status)
    if (status === 'fail') fail += 1
    else ok += 1

    const day = outreachLogDayKey(row?.created_at)
    if (day) {
      const cur = byDayMap.get(day) ?? { day, ok: 0, fail: 0, total: 0 }
      if (status === 'fail') cur.fail += 1
      else cur.ok += 1
      cur.total += 1
      byDayMap.set(day, cur)
    }

    const senderKey = row?.sent_by ? String(row.sent_by) : '_unknown'
    const senderName = String(row?.sent_by_name ?? '').trim() || (senderKey === '_unknown' ? 'Неизвестно' : 'Сотрудник')
    const sCur = bySenderMap.get(senderKey) ?? {
      key: senderKey,
      name: senderName,
      ok: 0,
      fail: 0,
      total: 0,
    }
    if (status === 'fail') sCur.fail += 1
    else sCur.ok += 1
    sCur.total += 1
    if (row?.sent_by_name) sCur.name = String(row.sent_by_name).trim() || sCur.name
    bySenderMap.set(senderKey, sCur)

    const cid = String(row?.client_id ?? '').trim()
    if (cid) clients.add(cid)
  }

  const byDay = [...byDayMap.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
  const bySender = [...bySenderMap.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ru'))

  return {
    total: ok + fail,
    ok,
    fail,
    unique_clients: clients.size,
    by_day: byDay,
    by_sender: bySender,
  }
}

/** @param {Array<object>} logs */
export function buildClubCallStats(logs) {
  return buildClubOutreachStats(logs, { normalizeStatus: normalizeClubCallLogStatus })
}

/** @param {Array<object>} logs */
export function buildClubSmsStats(logs) {
  return buildClubOutreachStats(logs, { normalizeStatus: normalizeClubSmsLogStatus })
}
