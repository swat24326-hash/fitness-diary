/**
 * Pull sale_clips: remote отдаёт только awaiting — локальный хвост иначе «вечный».
 * Чистая логика без IDB.
 */

import { normalizeSaleClipStatus } from './saleClipCore.js'

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
 * Абон уже создали вручную после клипа (без clip_id) → заявка «мёртвая».
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
 * План закрытия «живых» awaiting, которые уже не нужны на планшете.
 * @param {object[]} awaitingClips
 * @param {Record<string, object[]>} membershipsByClientId
 * @returns {{ clipId: string, action: 'cancel'|'done', membershipId: string|null, reason: string }[]}
 */
export function planSupersededAwaitingSaleClips(awaitingClips, membershipsByClientId) {
  const by = membershipsByClientId && typeof membershipsByClientId === 'object' ? membershipsByClientId : {}
  const out = []
  for (const clip of awaitingClips ?? []) {
    if (normalizeSaleClipStatus(clip?.status) !== 'awaiting') continue
    const clipId = String(clip?.id ?? '').trim()
    if (!clipId) continue
    const cid = String(clip?.client_id ?? '').trim()
    const mems = cid ? by[cid] ?? [] : []
    const linked = findLinkedMembershipForAwaitingClip(clip, mems)
    if (linked) {
      out.push({
        clipId,
        action: 'done',
        membershipId: String(linked.id ?? '').trim() || null,
        reason: 'Абон уже с clip_id — закрываем заявку',
      })
      continue
    }
    const superseding = findSupersedingMembership(clip, mems)
    if (superseding) {
      out.push({
        clipId,
        action: 'cancel',
        membershipId: String(superseding.id ?? '').trim() || null,
        reason: 'Абон создан вручную после заявки — клип больше не нужен',
      })
    }
  }
  return out
}
