/**
 * Диалоги клиента с инструкторами АЗ (не trainer_id). Без React / IDB.
 */

import { CHAT_KIND_AZ_INSTRUCTOR, CHAT_KINDS, clientChatKinds } from './chatAccessCore.js'
import { formatClientAzInstructorLabel } from '../admin/clientAzInstructorsCore.js'

export { CHAT_KIND_AZ_INSTRUCTOR }

/**
 * @param {unknown} kind
 */
export function isAzInstructorChatKind(kind) {
  return String(kind ?? '') === CHAT_KIND_AZ_INSTRUCTOR
}

/**
 * Все kind, включая инструкторов АЗ.
 * @param {unknown} kind
 */
export function isClientFacingChatKind(kind) {
  const k = String(kind ?? '')
  return CHAT_KINDS.includes(k) || isAzInstructorChatKind(k)
}

/**
 * Список диалогов для /me «Сообщения».
 * @param {{
 *   client?: { trainer_id?: unknown } | null,
 *   azInstructors?: Array<{ instructor_id?: unknown, direction_type_id?: unknown }>,
 *   instructorNameById?: Record<string, string> | Map<string, string>,
 *   directionNameById?: Record<string, string> | Map<string, string>,
 * }} input
 * @returns {Array<{ kind: string, peer_user_id: string|null, title: string, name: string }>}
 */
export function buildClientChatDialogs(input) {
  const client = input?.client
  const nameMap = toMap(input?.instructorNameById)
  const dirMap = toMap(input?.directionNameById)
  /** @type {Array<{ kind: string, peer_user_id: string|null, title: string, name: string }>} */
  const out = []

  for (const kind of clientChatKinds(client)) {
    out.push({ kind, peer_user_id: null, title: '', name: '' })
  }

  const seen = new Set()
  for (const row of input?.azInstructors ?? []) {
    const peer = String(row?.instructor_id ?? '').trim()
    if (!peer || seen.has(peer)) continue
    seen.add(peer)
    const name = nameMap.get(peer) || ''
    const dir = dirMap.get(String(row?.direction_type_id ?? '').trim()) || ''
    const title = formatClientAzInstructorLabel({ instructorName: name || 'Инструктор', directionName: dir })
    out.push({
      kind: CHAT_KIND_AZ_INSTRUCTOR,
      peer_user_id: peer,
      title,
      name,
    })
  }
  return out
}

/**
 * Ключ строки списка / кэша.
 * @param {{ kind?: unknown, peer_user_id?: unknown }} t
 */
export function chatDialogKey(t) {
  const kind = String(t?.kind ?? '')
  const peer = String(t?.peer_user_id ?? '').trim()
  return peer ? `${kind}:${peer}` : kind
}

/**
 * Показывать вкладку «От тренера» (ДЗ / рацион) — только при открытом ПЗ.
 * Живые залы из абонов важнее leftover trainer_id (был ПЗ → только АЗ — скрыть).
 * @param {{ trainer_id?: unknown, has_trainer?: unknown } | null | undefined} client
 * @param {{ liveHalls?: Set<string>|null }} [opts]
 */
export function clientShowsFromTrainerTab(client, opts = {}) {
  const halls = opts.liveHalls
  /* Пустой Set — абонов в кэше ещё нет / список пуст: не прячем по залам, смотрим тренера. */
  if (halls instanceof Set && halls.size > 0) return halls.has('pz')
  // Нет строки клиента (кэш ещё пуст) — не прячем вкладку, чтобы ПЗ не мигал.
  if (client == null) return true
  if (client.has_trainer != null) return Boolean(client.has_trainer)
  return Boolean(String(client?.trainer_id ?? '').trim())
}

/**
 * Клиент может писать инструктору АЗ, только если тот назначен в client_az_instructors.
 * @param {Array<{ instructor_id?: unknown }>|null|undefined} azRows
 * @param {unknown} peerUserId
 */
export function clientMayChatAzInstructor(azRows, peerUserId) {
  const peer = String(peerUserId ?? '').trim()
  if (!peer) return false
  return (azRows ?? []).some((r) => String(r?.instructor_id ?? '').trim() === peer)
}

/** Id инструкторов из строк назначения (уникальные). */
export function clientAzInstructorPeerIds(azRows) {
  const out = []
  const seen = new Set()
  for (const row of azRows ?? []) {
    const id = String(row?.instructor_id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Путь клиента к диалогу.
 * @param {{ kind?: unknown, peer_user_id?: unknown }} t
 */
export function clientChatPath(t) {
  const kind = String(t?.kind ?? '')
  const peer = String(t?.peer_user_id ?? '').trim()
  if (isAzInstructorChatKind(kind) && peer) return `/me/chat/${kind}/${encodeURIComponent(peer)}`
  return `/me/chat/${kind}`
}

/**
 * Ключ открытого диалога в мессенджере сотрудника: clientId:kind[:peer].
 * @param {{ clientId?: unknown, kind?: unknown, peerUserId?: unknown }} p
 */
export function staffClientChatKey(p) {
  const clientId = String(p?.clientId ?? '').trim()
  const kind = String(p?.kind ?? '').trim()
  const peer = String(p?.peerUserId ?? '').trim()
  if (!clientId || !kind) return ''
  return peer ? `${clientId}:${kind}:${peer}` : `${clientId}:${kind}`
}

/**
 * Разбор ?chat=clientId:kind[:peer] (UUID без двоеточий).
 * @param {string} raw
 * @returns {{ clientId: string, kind: string, peerUserId: string|null } | null}
 */
export function parseStaffClientChatKey(raw) {
  const parts = String(raw ?? '')
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  return {
    clientId: parts[0],
    kind: parts[1],
    peerUserId: parts[2] || null,
  }
}

function toMap(src) {
  if (!src) return new Map()
  if (src instanceof Map) return src
  return new Map(Object.entries(src).map(([k, v]) => [String(k), String(v ?? '')]))
}
