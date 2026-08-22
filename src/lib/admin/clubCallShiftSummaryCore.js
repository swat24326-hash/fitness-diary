/**
 * Сводка смены call-центра за день (управляющий /club) — чистые правила.
 * Опирается на journal stats + чипы воронки; без React/IDB.
 */

import { buildClubCallStats, buildClubSmsStats } from './clubOutreachStatsCore.js'
import { filterOutreachRowsByClubDay } from './clubOutreachDayFilter.js'
import {
  isClubCallFunnelCloseChip,
  isClubCallFunnelOpenChip,
  matchClubCallFunnelChip,
} from './clubCallFunnelChipsCore.js'

/** Чипы «ещё в работе — перезвонить / не взял / ждёт». */
const FOLLOWUP_CHIP_IDS = new Set([
  'no_answer',
  'busy',
  'callback_today',
  'callback_later',
  'waiting_offer',
])

/**
 * @param {object[]} callLogs
 * @param {string} dayIso YYYY-MM-DD (календарь клуба, МСК)
 */
export function filterOutreachLogsForDay(callLogs, dayIso) {
  return filterOutreachRowsByClubDay(callLogs, dayIso)
}

/**
 * @param {object} row
 * @returns {string | null}
 */
export function resolveClubCallShiftChipId(row) {
  return matchClubCallFunnelChip(row)?.chipId ?? null
}

/**
 * Последняя пометка за день на клиента (по created_at).
 * Без client_id — каждая строка сама по себе.
 * @param {object[]} callsDay
 * @returns {object[]}
 */
export function pickLatestCallNoteRows(callsDay) {
  /** @type {Map<string, object>} */
  const byClient = new Map()
  /** @type {object[]} */
  const anonymous = []

  for (const row of callsDay ?? []) {
    const chipId = resolveClubCallShiftChipId(row)
    if (!chipId) continue
    const cid = String(row?.client_id ?? '').trim()
    if (!cid) {
      anonymous.push(row)
      continue
    }
    const prev = byClient.get(cid)
    if (!prev) {
      byClient.set(cid, row)
      continue
    }
    const a = String(row?.created_at ?? '')
    const b = String(prev?.created_at ?? '')
    if (a >= b) byClient.set(cid, row)
  }

  return [...byClient.values(), ...anonymous]
}

/**
 * @param {object[]} callLogs — строки club_call_log (желательно уже за день)
 * @param {object[]} smsLogs
 * @param {{ day?: string }} [opts]
 */
export function buildClubCallShiftSummary(callLogs, smsLogs, opts = {}) {
  const day = String(opts.day ?? '').slice(0, 10)
  const callsRaw = Array.isArray(callLogs) ? callLogs : []
  const smsRaw = Array.isArray(smsLogs) ? smsLogs : []
  const callsDay = /^\d{4}-\d{2}-\d{2}$/.test(day) ? filterOutreachLogsForDay(callsRaw, day) : callsRaw
  const smsDay = /^\d{4}-\d{2}-\d{2}$/.test(day) ? filterOutreachLogsForDay(smsRaw, day) : smsRaw

  const call = buildClubCallStats(callsDay)
  const sms = buildClubSmsStats(smsDay)

  let openNotes = 0
  let closeNotes = 0
  let callbackOpen = 0
  let refused = 0
  let bought = 0
  let otherClose = 0
  /** @type {Set<string>} */
  const openClientIds = new Set()
  /** @type {Set<string>} */
  const followupClientIds = new Set()
  /** @type {Set<string>} */
  const closedClientIds = new Set()

  const latestNotes = pickLatestCallNoteRows(callsDay)
  for (const row of latestNotes) {
    const chipId = resolveClubCallShiftChipId(row)
    if (!chipId) continue
    const cid = String(row?.client_id ?? '').trim()
    if (isClubCallFunnelOpenChip(chipId)) {
      openNotes += 1
      if (cid) openClientIds.add(cid)
      if (FOLLOWUP_CHIP_IDS.has(chipId)) {
        callbackOpen += 1
        if (cid) followupClientIds.add(cid)
        else followupClientIds.add(`anon:${callbackOpen}`)
      }
    }
    if (isClubCallFunnelCloseChip(chipId)) {
      closeNotes += 1
      if (cid) closedClientIds.add(cid)
      else closedClientIds.add(`anon-close:${closeNotes}`)
      if (chipId === 'refused') refused += 1
      else if (chipId === 'bought') bought += 1
      else otherClose += 1
    }
  }

  const hasActivity = call.total > 0 || sms.total > 0
  const followupClients = followupClientIds.size
  const closedClients = closedClientIds.size
  const needsFollowup = followupClients > 0 || call.missed > 0 || call.pending > 0

  return {
    day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
    calls: call.total,
    answered: call.answered,
    missed: call.missed,
    short: call.short,
    pending: call.pending,
    fail: call.fail,
    connect_rate_pct: call.connect_rate_pct,
    talk_sec_total: call.talk_sec_total,
    sms: sms.total,
    sms_ok: sms.ok,
    sms_fail: sms.fail,
    open_notes: openNotes,
    close_notes: closeNotes,
    closed_clients: closedClients,
    callback_open: callbackOpen,
    followup_clients: followupClients,
    open_clients: openClientIds.size,
    refused,
    bought,
    other_close: otherClose,
    has_activity: hasActivity,
    needs_followup: needsFollowup,
    is_hot: call.missed > 0 || followupClients > 0,
  }
}

/**
 * @param {string} href
 * @param {string} tab
 */
function journalHrefWithTab(href, tab) {
  const base = String(href ?? '').trim() || '/club/call-log'
  const id = String(tab ?? '').trim()
  if (!id || id === 'list') return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}tab=${encodeURIComponent(id)}`
}

/**
 * Карточки для компактного блока на главной.
 * @param {ReturnType<typeof buildClubCallShiftSummary>} summary
 * @param {{ journalHref?: string }} [opts]
 */
export function buildClubCallShiftSummaryCards(summary, opts = {}) {
  const href = String(opts.journalHref ?? '/club/call-log').trim() || '/club/call-log'
  const s = summary || buildClubCallShiftSummary([], [])
  const followupCount = Math.max(0, Number(s.followup_clients) || 0)
  const closedCount = Math.max(0, Number(s.closed_clients) || Number(s.close_notes) || 0)
  return [
    {
      key: 'calls',
      label: 'Звонки',
      count: s.calls,
      hint:
        s.calls > 0
          ? `дозвон ${s.answered} · не взял ${s.missed}${s.pending ? ` · набор ${s.pending}` : ''}`
          : 'пока нет',
      to: journalHrefWithTab(href, 'list'),
      hot: s.missed > 0,
      warn: s.pending > 0 && s.missed === 0,
    },
    {
      key: 'sms',
      label: 'SMS',
      count: s.sms,
      hint: s.sms > 0 ? `ок ${s.sms_ok} · сбой ${s.sms_fail}` : 'пока нет',
      to: journalHrefWithTab(href, 'sms'),
      warn: s.sms_fail > 0,
    },
    {
      key: 'followup',
      label: 'Перезвонить',
      count: followupCount,
      hint:
        followupCount > 0
          ? `в работе ${s.open_notes}`
          : 'открытых нет',
      to: journalHrefWithTab(href, 'list'),
      hot: followupCount > 0,
    },
    {
      key: 'closed',
      label: 'Закрыто',
      count: closedCount,
      hint:
        closedCount > 0
          ? `отказ ${s.refused} · купил ${s.bought}${s.other_close ? ` · ещё ${s.other_close}` : ''}`
          : 'пометок нет',
      to: journalHrefWithTab(href, 'call-stats'),
    },
  ]
}
