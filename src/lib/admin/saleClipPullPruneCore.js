/**
 * Pull sale_clips: remote отдаёт только awaiting — локальный хвост иначе «вечный».
 * Чистая логика без IDB.
 */

import { normalizeSaleClipStatus, findMembershipFulfillingSaleClip } from './saleClipCore.js'

/**
 * Локальные awaiting, которых нет в remote awaiting → убрать с планшета
 * (на сервере уже done/cancelled или чужие).
 *
 * @param {object[]} localClips
 * @param {object[]} remoteAwaitingClips
 * @param {string} trainerId
 * @param {Set<string>|null|undefined} pendingKeys
 * @returns {string[]} ids to delete from IDB
 */
export function planTrainerSaleClipsPrune(localClips, remoteAwaitingClips, trainerId, pendingKeys) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return []
  const remoteIds = new Set(
    (remoteAwaitingClips ?? []).map((c) => String(c?.id ?? '').trim()).filter(Boolean),
  )
  const pending = pendingKeys instanceof Set ? pendingKeys : new Set()
  const out = []
  for (const row of localClips ?? []) {
    const id = String(row?.id ?? '').trim()
    if (!id) continue
    if (String(row?.trainer_id ?? '').trim() !== tid) continue
    if (normalizeSaleClipStatus(row?.status) !== 'awaiting') continue
    if (remoteIds.has(id)) continue
    if (pending.has(id)) continue
    out.push(id)
  }
  return out
}

/**
 * Абон уже создали вручную после клипа (без clip_id) → заявка исполнена вне кнопки.
 * @param {object} clip
 * @param {object[]} membershipsForClient
 */
export function isAwaitingSaleClipSupersededByMembership(clip, membershipsForClient) {
  return Boolean(findSupersedingMembership(clip, membershipsForClient))
}

/**
 * @param {object} clip
 * @param {object[]} membershipsForClient
 * @returns {object|null} membership, из‑за которого клип не нужен
 */
export function findSupersedingMembership(clip, membershipsForClient) {
  if (normalizeSaleClipStatus(clip?.status) !== 'awaiting') return null
  const clipId = String(clip?.id ?? '').trim()
  const clipAt = Date.parse(String(clip?.created_at ?? ''))
  if (!clipId || !Number.isFinite(clipAt)) return null
  let best = null
  let bestAt = Infinity
  for (const m of membershipsForClient ?? []) {
    if (String(m?.clip_id ?? '').trim() === clipId) return null
    const mAt = Date.parse(String(m?.created_at ?? ''))
    if (!Number.isFinite(mAt) || mAt < clipAt) continue
    if (mAt < bestAt) {
      bestAt = mAt
      best = m
    }
  }
  return best
}

/**
 * Клип уже привязан к абону (memberships.clip_id), но status ещё awaiting.
 * @param {object} clip
 * @param {object[]} membershipsForClient
 */
export function findLinkedMembershipForAwaitingClip(clip, membershipsForClient) {
  if (normalizeSaleClipStatus(clip?.status) !== 'awaiting') return null
  const clipId = String(clip?.id ?? '').trim()
  if (!clipId) return null
  return (membershipsForClient ?? []).find((m) => String(m?.clip_id ?? '').trim() === clipId) ?? null
}

/**
 * Waiting без client_id, но карта однозначно есть в клубе → привязать.
 * @param {object} clip
 * @param {Map<string, object>|Record<string, object>} clientsByCard
 * @returns {string|null} client_id
 */
export function resolveAwaitingSaleClipClientId(clip, clientsByCard) {
  if (normalizeSaleClipStatus(clip?.status) !== 'awaiting') return null
  if (String(clip?.client_id ?? '').trim()) return null
  const card = String(clip?.card_number ?? '').trim()
  if (!card) return null
  const map =
    clientsByCard instanceof Map
      ? clientsByCard
      : new Map(Object.entries(clientsByCard ?? {}).map(([k, v]) => [String(k), v]))
  const hit = map.get(card)
  const id = String(hit?.id ?? '').trim()
  return id || null
}

/**
 * План закрытия / дозаполнения awaiting.
 * @param {object[]} awaitingClips
 * @param {Record<string, object[]>} membershipsByClientId
 * @param {{
 *   clientsByCard?: Map<string, object>|Record<string, object>,
 *   clientsById?: Map<string, object>|Record<string, object>,
 * }} [opts]
 * @returns {{
 *   clipId: string,
 *   action: 'cancel'|'done'|'bind_client',
 *   membershipId: string|null,
 *   clientId: string|null,
 *   reason: string,
 * }[]}
 */
export function planSupersededAwaitingSaleClips(awaitingClips, membershipsByClientId, opts = {}) {
  const by = membershipsByClientId && typeof membershipsByClientId === 'object' ? membershipsByClientId : {}
  const clientsByCard = opts.clientsByCard
  const clientsById =
    opts.clientsById instanceof Map
      ? opts.clientsById
      : opts.clientsById && typeof opts.clientsById === 'object'
        ? new Map(Object.entries(opts.clientsById))
        : null
  const out = []
  for (const clip of awaitingClips ?? []) {
    if (normalizeSaleClipStatus(clip?.status) !== 'awaiting') continue
    const clipId = String(clip?.id ?? '').trim()
    if (!clipId) continue

    const existingClientId = String(clip?.client_id ?? '').trim()
    if (existingClientId && clientsById) {
      const row = clientsById.get(existingClientId)
      if (row && row.archived_at) {
        out.push({
          clipId,
          action: 'cancel',
          membershipId: null,
          clientId: existingClientId,
          reason: 'Клиент в архиве — заявка снята',
        })
        continue
      }
    }

    const bindId = clientsByCard ? resolveAwaitingSaleClipClientId(clip, clientsByCard) : null
    const cid = String(clip?.client_id ?? bindId ?? '').trim()
    const mems = cid ? by[cid] ?? [] : []
    const fulfilling = findMembershipFulfillingSaleClip(clip, mems)
    if (fulfilling) {
      out.push({
        clipId,
        action: 'done',
        membershipId: String(fulfilling.id ?? '').trim() || null,
        clientId: cid || null,
        reason: 'Абон по этой продаже уже есть — заявку закрыли',
      })
      continue
    }
    const linked = findLinkedMembershipForAwaitingClip(clip, mems)
    if (linked) {
      out.push({
        clipId,
        action: 'done',
        membershipId: String(linked.id ?? '').trim() || null,
        clientId: cid || null,
        reason: 'Абон уже с clip_id — закрываем заявку',
      })
      continue
    }
    const superseding = findSupersedingMembership(
      cid ? { ...clip, client_id: cid } : clip,
      mems,
    )
    if (superseding) {
      out.push({
        clipId,
        action: 'done',
        membershipId: String(superseding.id ?? '').trim() || null,
        clientId: cid || null,
        reason: 'Абон уже создан — заявку закрыли как выполненную',
      })
      continue
    }
    if (bindId) {
      out.push({
        clipId,
        action: 'bind_client',
        membershipId: null,
        clientId: bindId,
        reason: 'Привязали клиента по номеру карты',
      })
    }
  }
  return out
}
