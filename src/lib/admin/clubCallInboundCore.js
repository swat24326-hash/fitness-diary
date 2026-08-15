/**
 * Входящие звонки клуба (webhook call.finish без исходящей команды Оси).
 */

import {
  normalizeCallOutcomePhone,
  buildClubCallFinishPatch,
} from './clubCallOutcomeCore.js'
import { truncateClubCallPhone } from './clubCallLogCore.js'

export const CLUB_CALL_DIRECTIONS = ['outbound', 'inbound']

/** @param {unknown} raw */
export function normalizeClubCallDirection(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  return s === 'inbound' ? 'inbound' : 'outbound'
}

/**
 * Направление из event Мои Звонки (разные имена полей в интеграциях).
 * @param {Record<string, unknown> | null | undefined} event
 * @returns {'inbound' | 'outbound' | 'unknown'}
 */
export function detectMoiZvonkiCallDirection(event) {
  if (!event || typeof event !== 'object') return 'unknown'
  if (event.inbound === true || event.incoming === true || event.is_inbound === true) return 'inbound'
  if (event.outbound === true || event.outgoing === true || event.is_outbound === true) return 'outbound'
  const raw = String(
    event.direction ??
      event.call_direction ??
      event.type ??
      event.call_type ??
      event.event_type ??
      '',
  )
    .trim()
    .toLowerCase()
  if (!raw) return 'unknown'
  if (raw === '0' || raw === 'in') return 'inbound'
  if (raw === '1' || raw === 'out') return 'outbound'
  if (/^(in|incoming|inbound|входящ)/.test(raw) || raw.includes('incoming') || raw.includes('inbound')) {
    return 'inbound'
  }
  if (/^(out|outgoing|outbound|исходящ)/.test(raw) || raw.includes('outgoing') || raw.includes('outbound')) {
    return 'outbound'
  }
  return 'unknown'
}

/**
 * Создавать ли входящую строку, если исходящий матч не найден.
 * Только явное входящее направление — иначе чужие исходящие (с телефона без Оси)
 * или несматченный finish превратятся в ложный «Вход.».
 * @param {Record<string, unknown> | null | undefined} event
 * @param {boolean} matchedOutbound
 */
export function shouldCreateInboundFromFinish(event, matchedOutbound) {
  if (matchedOutbound) return false
  return detectMoiZvonkiCallDirection(event) === 'inbound'
}

/**
 * Привязка телефона к клиентам клуба (уже нормализованный список).
 * @param {Array<{ id?: string, phone?: string | null, archived_at?: string | null }>} clients
 * @param {string} phoneRaw
 * @returns {{ status: 'none' | 'one' | 'conflict', client_id: string | null, client_ids: string[] }}
 */
export function resolveInboundClientByPhone(clients, phoneRaw) {
  const phone = normalizeCallOutcomePhone(phoneRaw)
  if (!phone || phone.length < 10) {
    return { status: 'none', client_id: null, client_ids: [] }
  }
  const ids = []
  for (const c of clients ?? []) {
    if (c?.archived_at) continue
    const p = normalizeCallOutcomePhone(c?.phone)
    if (p && p === phone) {
      const id = String(c.id ?? '').trim()
      if (id) ids.push(id)
    }
  }
  const unique = [...new Set(ids)]
  if (unique.length === 1) return { status: 'one', client_id: unique[0], client_ids: unique }
  if (unique.length > 1) return { status: 'conflict', client_id: null, client_ids: unique }
  return { status: 'none', client_id: null, client_ids: [] }
}

/**
 * Строка insert для входящего после call.finish.
 * @param {{
 *   club_id: string,
 *   client_id?: string | null,
 *   finish: ReturnType<typeof import('./clubCallOutcomeCore.js').shapeCallFinishFromMoiZvonkiEvent>,
 * }} input
 */
export function buildClubCallInboundInsertRow(input) {
  const club_id = String(input.club_id ?? '').trim()
  const finish = input.finish
  if (!club_id || !finish?.phone) {
    return { ok: false, error: 'club_id and phone required' }
  }
  const client_id = String(input.client_id ?? '').trim() || null
  const patch = buildClubCallFinishPatch(finish)
  const createdAt = finish.start_time_ms
    ? new Date(finish.start_time_ms).toISOString()
    : patch.finished_at
  return {
    ok: true,
    row: {
      club_id,
      client_id,
      sent_by: null,
      phone: truncateClubCallPhone(normalizeCallOutcomePhone(finish.phone) || finish.phone) || finish.phone,
      status: 'ok',
      error_message: null,
      direction: 'inbound',
      created_at: createdAt,
      outcome: patch.outcome,
      answered: patch.answered,
      duration_sec: patch.duration_sec,
      mz_db_call_id: patch.mz_db_call_id,
      mz_pbx_call_id: patch.mz_pbx_call_id,
      src_number: patch.src_number,
      finished_at: patch.finished_at,
      recording_url: patch.recording_url,
    },
  }
}
