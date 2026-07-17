/**
 * Анонимный журнал отказов ПНК (без React/IDB).
 */
import { isOpenPnkClient, parsePnkDeliverables, pnkPackageProgress } from './pnkStagesCore.js'

function resolveEnteredAt(client) {
  const raw = client?.pnk_created_at ?? client?.created_at ?? null
  if (!raw) return null
  const s = String(raw)
  return s.length >= 10 ? s : null
}

/**
 * @param {object} client
 * @param {{ reason?: string, occurredAt?: string, id?: string }} [opts]
 * @returns {{ ok: true, event: object } | { ok: false, error: string }}
 */
export function buildPnkLostFunnelEvent(client, opts = {}) {
  if (!client?.id) return { ok: false, error: 'Нет клиента' }
  if (!isOpenPnkClient(client) && String(client.lifecycle ?? '') !== 'pnk_lost') {
    return { ok: false, error: 'Отказ только для карточки ПНК' }
  }
  const clubId = String(client.club_id ?? '').trim()
  if (!clubId) return { ok: false, error: 'У клиента не указан клуб' }

  const d = parsePnkDeliverables(client.pnk_deliverables)
  const pkg = pnkPackageProgress(client)
  const occurredAt = opts.occurredAt || client.pnk_lost_at || new Date().toISOString()
  const reason = String(opts.reason ?? client.pnk_lost_reason ?? '')
    .trim()
    .slice(0, 200)
  const id =
    opts.id ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pnk-lost-${Date.now()}-${Math.random().toString(16).slice(2)}`)

  return {
    ok: true,
    event: {
      id,
      club_id: clubId,
      trainer_id: String(client.trainer_id ?? '').trim() || null,
      event_type: 'lost',
      entered_at: resolveEnteredAt(client),
      occurred_at: occurredAt,
      reason: reason || null,
      had_nutrition: Boolean(pkg.nutrition || d.nutrition),
      had_homework: Boolean(pkg.homework || d.homework),
      trial_done: Boolean(d.trial),
      package_done: Boolean(pkg.done),
    },
  }
}

/**
 * Payload для push-record (без локальных полей).
 * @param {object} row
 */
export function normalizePnkFunnelEventPushPayload(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id ?? '').trim()
  const clubId = String(row.club_id ?? '').trim()
  if (!id || !clubId) return null
  const eventType = String(row.event_type ?? 'lost').trim() || 'lost'
  if (eventType !== 'lost') return null
  return {
    id,
    club_id: clubId,
    trainer_id: String(row.trainer_id ?? '').trim() || null,
    event_type: eventType,
    entered_at: row.entered_at ? String(row.entered_at) : null,
    occurred_at: String(row.occurred_at ?? new Date().toISOString()),
    reason: row.reason != null ? String(row.reason).trim().slice(0, 200) || null : null,
    had_nutrition: row.had_nutrition === true,
    had_homework: row.had_homework === true,
    trial_done: row.trial_done === true,
    package_done: row.package_done === true,
  }
}
