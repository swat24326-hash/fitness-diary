/**
 * Жизнь клиента по направлениям (ПЗ/ТЗ/АЗ).
 * Закрытие зала ≠ архив клуба. Без React / IDB.
 * Канон: docs/CLIENT_HALL_LIFECYCLE.md
 */

import {
  normalizeArchiveReasonInput,
  normalizeArchiveReasonText,
  isArchiveReasonReady,
  buildArchiveEnterFields,
  buildArchiveRestoreFields,
} from './clientArchiveReasonCore.js'
import {
  isReturnLaterReasonText,
  normalizeExpectedReturnOn,
} from './clientArchiveExpectedReturnCore.js'
import {
  MEMBERSHIP_HALLS,
  membershipHallOf,
  normalizeMembershipHall,
} from './membershipHallCore.js'
import {
  hasCalendarUnlimitedCovering,
  membershipCoversDate,
  membershipIsUsableOn,
} from './membershipRules.js'
import { addDaysToIso, todayLocalIso } from './dateRu.js'

export const CLIENT_HALL_LIFECYCLE_TABLE = 'client_hall_lifecycle'

/**
 * @param {unknown} raw
 * @returns {import('./membershipHallCore.js').MembershipHall|null}
 */
export function normalizeLifecycleHall(raw) {
  return normalizeMembershipHall(raw)
}

/**
 * @param {object|null|undefined} row
 */
export function isHallLifecycleClosed(row) {
  if (!row) return false
  const at = row.closed_at
  return at != null && String(at).trim() !== ''
}

/**
 * @param {object[]|null|undefined} rows
 * @param {string} clientId
 * @param {string} hall
 */
export function findLifecycleRow(rows, clientId, hall) {
  const cid = String(clientId ?? '').trim()
  const h = normalizeLifecycleHall(hall)
  if (!cid || !h) return null
  return (
    (rows ?? []).find(
      (r) => String(r?.client_id ?? '').trim() === cid && normalizeLifecycleHall(r?.hall) === h,
    ) ?? null
  )
}

/**
 * @param {object[]|null|undefined} memberships
 * @param {string} hall
 * @param {string} [asOf]
 * @param {object|null|undefined} [client]
 */
export function hasLiveMembershipForHall(memberships, hall, asOf = todayLocalIso(), client) {
  const want = normalizeLifecycleHall(hall)
  const d = String(asOf ?? '').slice(0, 10)
  if (!want || !d) return false
  const list = (memberships ?? []).filter((m) => membershipHallOf(m, client) === want)
  if (!list.length) return false
  if (list.some((m) => membershipIsUsableOn(m, d))) return true
  if (hasCalendarUnlimitedCovering(list, d)) return true
  // ТЗ без лимита занятий: срок кроет дату → живой
  if (want === 'tz') return list.some((m) => membershipCoversDate(m, d))
  return false
}

/**
 * Направление открыто: живой абон и нет closed_at.
 * @param {{ client?: object, memberships?: object[], lifecycleRows?: object[], hall: string, asOf?: string }} p
 */
export function isHallOpen(p = {}) {
  const hall = normalizeLifecycleHall(p.hall)
  if (!hall) return false
  const clientId = String(p.client?.id ?? '').trim()
  const row = findLifecycleRow(p.lifecycleRows, clientId, hall)
  if (isHallLifecycleClosed(row)) return false
  return hasLiveMembershipForHall(p.memberships, hall, p.asOf ?? todayLocalIso(), p.client)
}

/**
 * @param {{ client?: object, memberships?: object[], lifecycleRows?: object[], asOf?: string }} p
 * @returns {import('./membershipHallCore.js').MembershipHall[]}
 */
export function listOpenHalls(p = {}) {
  return MEMBERSHIP_HALLS.filter((hall) => isHallOpen({ ...p, hall }))
}

/**
 * Патчи абонов: обрезать end_date, чтобы не кроили asOf.
 * @param {object[]} memberships
 * @param {string} hall
 * @param {string} [asOf]
 * @param {object|null|undefined} [client]
 * @returns {object[]}
 */
export function buildEndLiveMembershipsForHall(memberships, hall, asOf = todayLocalIso(), client) {
  const want = normalizeLifecycleHall(hall)
  const d = String(asOf ?? '').slice(0, 10)
  if (!want || !d) return []
  const endExclusive = addDaysToIso(d, -1)
  if (!endExclusive) return []
  const out = []
  for (const m of memberships ?? []) {
    if (membershipHallOf(m, client) !== want) continue
    if (!hasLiveMembershipForHall([m], want, d, client)) continue
    const start = String(m.start_date ?? '').slice(0, 10)
    let newEnd = endExclusive
    if (start && newEnd < start) newEnd = start
    if (String(m.end_date ?? '').slice(0, 10) === newEnd) continue
    out.push({ ...m, end_date: newEnd })
  }
  return out
}

/**
 * @param {{ client: object, memberships?: object[], lifecycleRows?: object[], asOf?: string, nowIso?: string }} p
 * @returns {object[]}
 */
export function buildAutoCloseHallsWithoutLiveMembership(p = {}) {
  const client = p.client
  const clientId = String(client?.id ?? '').trim()
  const clubId = String(client?.club_id ?? '').trim()
  if (!clientId || !clubId) return []
  const asOf = p.asOf ?? todayLocalIso()
  const nowIso = p.nowIso ?? new Date().toISOString()
  const out = []
  for (const hall of MEMBERSHIP_HALLS) {
    if (hasLiveMembershipForHall(p.memberships, hall, asOf, client)) continue
    const existing = findLifecycleRow(p.lifecycleRows, clientId, hall)
    if (isHallLifecycleClosed(existing)) continue
    const everHad = (p.memberships ?? []).some((m) => membershipHallOf(m, client) === hall)
    if (!everHad && !existing) continue
    out.push({
      id: String(existing?.id ?? '').trim() || newLifecycleId(),
      client_id: clientId,
      club_id: clubId,
      hall,
      closed_at: nowIso,
      close_reason: 'Закончился абонемент',
      close_reason_at: nowIso,
      expected_return_on: null,
      updated_at: nowIso,
    })
  }
  return out
}

function newLifecycleId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `lch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {string|{ reason?: string, expectedReturnOn?: string|null }|null|undefined} reasonInput
 * @param {string} [nowIso]
 */
export function buildHallCloseFields(reasonInput, nowIso = new Date().toISOString()) {
  const { reason, expectedReturnOn } = normalizeArchiveReasonInput(reasonInput)
  if (!isArchiveReasonReady(reason)) {
    return { ok: false, error: 'Укажите причину закрытия направления' }
  }
  if (isReturnLaterReasonText(reason) && !normalizeExpectedReturnOn(expectedReturnOn)) {
    return { ok: false, error: 'Укажите, до когда ждать возврата' }
  }
  return {
    ok: true,
    closed_at: nowIso,
    close_reason: reason,
    close_reason_at: nowIso,
    expected_return_on: isReturnLaterReasonText(reason)
      ? normalizeExpectedReturnOn(expectedReturnOn)
      : null,
  }
}

/**
 * @param {object|null|undefined} existing
 * @param {string} [nowIso]
 */
export function buildHallReopenFields(existing, nowIso = new Date().toISOString()) {
  if (!existing?.id) {
    return {
      id: newLifecycleId(),
      closed_at: null,
      close_reason: null,
      close_reason_at: null,
      expected_return_on: null,
      updated_at: nowIso,
    }
  }
  return {
    ...existing,
    closed_at: null,
    close_reason: null,
    close_reason_at: null,
    expected_return_on: null,
    updated_at: nowIso,
  }
}

/**
 * @param {{ client?: object, memberships?: object[], lifecycleRows?: object[], asOf?: string, pnkOpen?: boolean }} p
 */
export function reconcileClubArchiveDecision(p = {}) {
  const opens = listOpenHalls(p)
  const pnkOpen =
    p.pnkOpen === true ||
    String(p.client?.lifecycle ?? '')
      .trim()
      .toLowerCase() === 'pnk'
  const hasOpen = opens.length > 0 || pnkOpen
  const archived = Boolean(p.client?.archived_at)
  if (hasOpen) {
    return { shouldArchive: false, shouldRestore: archived }
  }
  return { shouldArchive: !archived, shouldRestore: false }
}

/**
 * @param {{ client: object, memberships?: object[], lifecycleRows?: object[], asOf?: string, nowIso?: string, archiveReason?: string, pnkOpen?: boolean }} p
 */
export function buildReconcileClubArchiveClientPatch(p = {}) {
  const decision = reconcileClubArchiveDecision(p)
  const nowIso = p.nowIso ?? new Date().toISOString()
  if (decision.shouldRestore) {
    return { ok: true, clientPatch: buildArchiveRestoreFields() }
  }
  if (decision.shouldArchive) {
    const reason = normalizeArchiveReasonText(p.archiveReason) || 'Нет открытых направлений'
    const enter = buildArchiveEnterFields(reason, nowIso)
    if (!enter.ok) return { ok: false, error: enter.error }
    return { ok: true, clientPatch: enter.patch }
  }
  return { ok: true, clientPatch: null }
}

/**
 * @param {{
 *   client: object,
 *   hall: string,
 *   reasonInput: string|{ reason?: string, expectedReturnOn?: string|null },
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   asOf?: string,
 *   nowIso?: string,
 * }} p
 */
export function planCloseHall(p = {}) {
  const hall = normalizeLifecycleHall(p.hall)
  if (!hall) return { ok: false, error: 'Неизвестный зал' }
  const client = p.client
  const clientId = String(client?.id ?? '').trim()
  const clubId = String(client?.club_id ?? '').trim()
  if (!clientId || !clubId) return { ok: false, error: 'Клиент без id / клуба' }

  const fields = buildHallCloseFields(p.reasonInput, p.nowIso)
  if (!fields.ok) return fields

  const asOf = p.asOf ?? todayLocalIso()
  const nowIso = p.nowIso ?? fields.closed_at
  const membershipPatches = buildEndLiveMembershipsForHall(p.memberships, hall, asOf, client)
  const membershipsAfter = applyMembershipPatches(p.memberships, membershipPatches)

  const existing = findLifecycleRow(p.lifecycleRows, clientId, hall)
  const lifecycleRow = {
    ...(existing ?? {}),
    id: existing?.id || newLifecycleId(),
    client_id: clientId,
    club_id: clubId,
    hall,
    closed_at: fields.closed_at,
    close_reason: fields.close_reason,
    close_reason_at: fields.close_reason_at,
    expected_return_on: fields.expected_return_on,
    updated_at: nowIso,
  }

  const lifecycleAfter = upsertLifecycleRows(p.lifecycleRows, lifecycleRow)
  const autoRows = buildAutoCloseHallsWithoutLiveMembership({
    client,
    memberships: membershipsAfter,
    lifecycleRows: lifecycleAfter,
    asOf,
    nowIso,
  })
  let lifecycleFinal = lifecycleAfter
  for (const row of autoRows) {
    lifecycleFinal = upsertLifecycleRows(lifecycleFinal, row)
  }

  const reconcile = buildReconcileClubArchiveClientPatch({
    client,
    memberships: membershipsAfter,
    lifecycleRows: lifecycleFinal,
    asOf,
    nowIso,
    archiveReason: fields.close_reason,
    pnkOpen: false,
  })
  if (!reconcile.ok) return reconcile

  return {
    ok: true,
    hall,
    membershipPatches,
    lifecycleRow,
    autoLifecycleRows: autoRows,
    clientPatch: reconcile.clientPatch,
    burnsLoyaltyPz: hall === 'pz' && !reconcile.clientPatch?.archived_at,
    clubArchiveEntered: Boolean(reconcile.clientPatch?.archived_at),
  }
}

/**
 * @param {{
 *   client: object,
 *   hall: string,
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   asOf?: string,
 *   nowIso?: string,
 *   requireLiveMembership?: boolean,
 * }} p
 */
export function planReopenHall(p = {}) {
  const hall = normalizeLifecycleHall(p.hall)
  if (!hall) return { ok: false, error: 'Неизвестный зал' }
  const client = p.client
  const clientId = String(client?.id ?? '').trim()
  const clubId = String(client?.club_id ?? '').trim()
  if (!clientId || !clubId) return { ok: false, error: 'Клиент без id / клуба' }

  const asOf = p.asOf ?? todayLocalIso()
  if (p.requireLiveMembership !== false) {
    if (!hasLiveMembershipForHall(p.memberships, hall, asOf, client)) {
      return { ok: false, error: 'Сначала оформите живой абонемент этого направления' }
    }
  }

  const nowIso = p.nowIso ?? new Date().toISOString()
  const existing = findLifecycleRow(p.lifecycleRows, clientId, hall)
  const lifecycleRow = {
    ...buildHallReopenFields(existing, nowIso),
    client_id: clientId,
    club_id: clubId,
    hall,
    id: existing?.id || newLifecycleId(),
  }
  const lifecycleAfter = upsertLifecycleRows(p.lifecycleRows, lifecycleRow)
  const reconcile = buildReconcileClubArchiveClientPatch({
    client,
    memberships: p.memberships,
    lifecycleRows: lifecycleAfter,
    asOf,
    nowIso,
  })
  if (!reconcile.ok) return reconcile

  return {
    ok: true,
    hall,
    lifecycleRow,
    clientPatch: reconcile.clientPatch,
  }
}

/**
 * @param {{
 *   client: object,
 *   reasonInput: string|{ reason?: string, expectedReturnOn?: string|null },
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   asOf?: string,
 *   nowIso?: string,
 * }} p
 */
export function planLeaveClub(p = {}) {
  const fields = buildHallCloseFields(p.reasonInput, p.nowIso)
  if (!fields.ok) return fields
  const client = p.client
  const clientId = String(client?.id ?? '').trim()
  const clubId = String(client?.club_id ?? '').trim()
  if (!clientId || !clubId) return { ok: false, error: 'Клиент без id / клуба' }

  const asOf = p.asOf ?? todayLocalIso()
  const nowIso = p.nowIso ?? fields.closed_at
  let memberships = [...(p.memberships ?? [])]
  const membershipPatches = []
  const lifecycleOut = []

  for (const hall of MEMBERSHIP_HALLS) {
    const memPatch = buildEndLiveMembershipsForHall(memberships, hall, asOf, client)
    for (const m of memPatch) {
      membershipPatches.push(m)
      memberships = applyMembershipPatches(memberships, [m])
    }
    const existing = findLifecycleRow(p.lifecycleRows, clientId, hall)
    const everHad =
      Boolean(existing) ||
      (p.memberships ?? []).some((m) => membershipHallOf(m, client) === hall) ||
      hall === 'pz'
    if (!everHad) continue
    lifecycleOut.push({
      ...(existing ?? {}),
      id: existing?.id || newLifecycleId(),
      client_id: clientId,
      club_id: clubId,
      hall,
      closed_at: fields.closed_at,
      close_reason: fields.close_reason,
      close_reason_at: fields.close_reason_at,
      expected_return_on: fields.expected_return_on,
      updated_at: nowIso,
    })
  }

  const enter = buildArchiveEnterFields(fields.close_reason, nowIso)
  if (!enter.ok) return enter

  return {
    ok: true,
    membershipPatches,
    lifecycleRows: lifecycleOut,
    clientPatch: enter.patch,
    burnsLoyaltyPz: false,
  }
}

/**
 * @param {object[]|null|undefined} memberships
 * @param {object[]} patches
 */
export function applyMembershipPatches(memberships, patches) {
  const map = new Map((memberships ?? []).map((m) => [String(m.id), m]))
  for (const patch of patches ?? []) {
    if (!patch?.id) continue
    map.set(String(patch.id), { ...(map.get(String(patch.id)) ?? {}), ...patch })
  }
  return [...map.values()]
}

/**
 * @param {object[]|null|undefined} rows
 * @param {object} row
 */
export function upsertLifecycleRows(rows, row) {
  const list = [...(rows ?? [])]
  const hall = normalizeLifecycleHall(row?.hall)
  const cid = String(row?.client_id ?? '').trim()
  const idx = list.findIndex(
    (r) => String(r?.client_id ?? '').trim() === cid && normalizeLifecycleHall(r?.hall) === hall,
  )
  if (idx >= 0) list[idx] = { ...list[idx], ...row }
  else list.push(row)
  return list
}

/**
 * @param {{ client: object, memberships?: object[], lifecycleRows?: object[], asOf?: string }} p
 * @returns {'club_archive'|'has_tz'|'has_az'|'closed'|null}
 */
export function trainerClosedListBadge(p = {}) {
  if (p.client?.archived_at) return 'club_archive'
  if (hasLiveMembershipForHall(p.memberships, 'tz', p.asOf, p.client)) return 'has_tz'
  if (hasLiveMembershipForHall(p.memberships, 'az', p.asOf, p.client)) return 'has_az'
  return 'closed'
}

export function trainerClosedListBadgeLabel(badge) {
  if (badge === 'club_archive') return 'архив клуба'
  if (badge === 'has_tz') return 'есть ТЗ'
  if (badge === 'has_az') return 'есть АЗ'
  if (badge === 'closed') return 'закрыт ПЗ'
  return ''
}

export function isTrainerPzClosedView(client, lifecycleRows) {
  if (!client) return false
  if (client.archived_at) return true
  return isHallLifecycleClosed(findLifecycleRow(lifecycleRows, client.id, 'pz'))
}

export function isTrainerPzActiveView(client, lifecycleRows) {
  if (!client || client.archived_at) return false
  return !isHallLifecycleClosed(findLifecycleRow(lifecycleRows, client.id, 'pz'))
}

/**
 * Закрытие ПЗ → burn лояльности (даже без архива клуба).
 * @param {{ before?: object|null, after?: object|null, hall?: string }} p
 */
export function detectLoyaltyPzHallCloseBurn(p = {}) {
  const hall = normalizeLifecycleHall(p.hall ?? p.after?.hall ?? p.before?.hall)
  if (hall !== 'pz') return { write: false }
  const was = isHallLifecycleClosed(p.before)
  const now = isHallLifecycleClosed(p.after)
  if (!now || was) return { write: false }
  const clientId = String(p.after?.client_id ?? p.before?.client_id ?? '').trim()
  const clubId = String(p.after?.club_id ?? p.before?.club_id ?? '').trim()
  if (!clientId || !clubId) return { write: false }
  return {
    write: true,
    clientId,
    clubId,
    at: p.after?.closed_at,
  }
}

/**
 * Нужен ли confirm «Закрыть ПЗ?» при оформлении ТЗ/АЗ.
 */
export function shouldPromptClosePzOnDeskSale(p = {}) {
  const hall = normalizeLifecycleHall(p.saleHall)
  if (hall !== 'tz' && hall !== 'az') return false
  if (isHallLifecycleClosed(findLifecycleRow(p.lifecycleRows, p.client?.id, 'pz'))) return false
  return hasLiveMembershipForHall(p.memberships, 'pz', p.asOf, p.client)
}
