/**
 * Сводка по журналам клубной связи (звонки / SMS) — чистые правила.
 * Звонки: исходы webhook + команда API. SMS: ok|fail команды.
 */

import { normalizeClubCallLogStatus } from './clubCallLogCore.js'
import { normalizeClubCallOutcome } from './clubCallOutcomeCore.js'
import { normalizeClubSmsLogStatus } from './clubSmsLogCore.js'
import { calendarDayInTimeZoneIso } from '../dateRu.js'

/**
 * День строки журнала в календаре клуба (МСК), не UTC-префикс ISO.
 * @param {string | null | undefined} iso
 */
export function outreachLogDayKey(iso) {
  return calendarDayInTimeZoneIso(iso)
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
    const senderName =
      String(row?.sent_by_name ?? '').trim() || (senderKey === '_unknown' ? 'Неизвестно' : 'Сотрудник')
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

/**
 * Пустой слот сотрудника в сводке звонков.
 * @param {string} key
 * @param {string} name
 */
function emptyCallSenderBucket(key, name) {
  return {
    key,
    name,
    total: 0,
    fail: 0,
    answered: 0,
    missed: 0,
    short: 0,
    pending: 0,
    successful: 0,
    unsuccessful: 0,
  }
}

/**
 * Сводка звонков за выборку журнала: объём, исходы, % дозвона, время разговора, по сотрудникам.
 * @param {Array<{
 *   status?: string,
 *   outcome?: string | null,
 *   duration_sec?: number | null,
 *   created_at?: string,
 *   sent_by?: string | null,
 *   sent_by_name?: string | null,
 *   client_id?: string,
 * }>} logs
 */
export function buildClubCallStats(logs) {
  let fail = 0
  let answered = 0
  let missed = 0
  let short = 0
  let pending = 0
  let talkSecTotal = 0
  let talkCount = 0
  /** @type {Map<string, number>} */
  const clientCounts = new Map()
  /** @type {Map<string, ReturnType<typeof emptyCallSenderBucket>>} */
  const bySenderMap = new Map()

  for (const row of logs ?? []) {
    const cid = String(row?.client_id ?? '').trim()
    if (cid) clientCounts.set(cid, (clientCounts.get(cid) || 0) + 1)

    const senderKey = row?.sent_by ? String(row.sent_by) : '_unknown'
    const senderName =
      String(row?.sent_by_name ?? '').trim() || (senderKey === '_unknown' ? 'Неизвестно' : 'Сотрудник')
    const bucket = bySenderMap.get(senderKey) ?? emptyCallSenderBucket(senderKey, senderName)
    if (row?.sent_by_name) bucket.name = String(row.sent_by_name).trim() || bucket.name
    bucket.total += 1

    if (normalizeClubCallLogStatus(row?.status) === 'fail') {
      fail += 1
      bucket.fail += 1
      bySenderMap.set(senderKey, bucket)
      continue
    }

    const outcome = normalizeClubCallOutcome(row?.outcome)
    if (outcome === 'answered') {
      answered += 1
      bucket.answered += 1
      bucket.successful += 1
      const dur = Math.max(0, Math.floor(Number(row?.duration_sec) || 0))
      if (dur > 0) {
        talkSecTotal += dur
        talkCount += 1
      }
    } else if (outcome === 'missed') {
      missed += 1
      bucket.missed += 1
      bucket.unsuccessful += 1
    } else if (outcome === 'short') {
      short += 1
      bucket.short += 1
      bucket.unsuccessful += 1
    } else {
      pending += 1
      bucket.pending += 1
    }
    bySenderMap.set(senderKey, bucket)
  }

  const successful = answered
  const unsuccessful = missed + short
  const finished = successful + unsuccessful
  const total = answered + missed + short + pending + fail
  let clientsRepeat = 0
  for (const n of clientCounts.values()) {
    if (n >= 2) clientsRepeat += 1
  }

  let inboundTotal = 0
  let inboundAnswered = 0
  let inboundMissed = 0
  let outboundTotal = 0
  for (const row of logs ?? []) {
    const dir = String(row?.direction ?? 'outbound').toLowerCase() === 'inbound' ? 'inbound' : 'outbound'
    if (dir === 'inbound') {
      inboundTotal += 1
      if (normalizeClubCallLogStatus(row?.status) === 'fail') continue
      const outcome = normalizeClubCallOutcome(row?.outcome)
      if (outcome === 'answered') inboundAnswered += 1
      else if (outcome === 'missed' || outcome === 'short') inboundMissed += 1
    } else {
      outboundTotal += 1
    }
  }

  const bySender = [...bySenderMap.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ru'),
  )

  return {
    total,
    fail,
    answered,
    missed,
    short,
    pending,
    successful,
    unsuccessful,
    finished,
    connect_rate_pct: finished > 0 ? Math.round((100 * successful) / finished) : null,
    unique_clients: clientCounts.size,
    clients_repeat: clientsRepeat,
    talk_sec_total: talkSecTotal,
    talk_sec_avg: talkCount > 0 ? Math.round(talkSecTotal / talkCount) : null,
    inbound_total: inboundTotal,
    inbound_answered: inboundAnswered,
    inbound_missed: inboundMissed,
    outbound_total: outboundTotal,
    by_sender: bySender,
    ok: answered + missed + short + pending,
    by_day: [],
  }
}

/** @param {Array<object>} logs */
export function buildClubSmsStats(logs) {
  return buildClubOutreachStats(logs, { normalizeStatus: normalizeClubSmsLogStatus })
}
