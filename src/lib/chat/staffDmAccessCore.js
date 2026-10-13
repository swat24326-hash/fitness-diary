/**
 * Переписка сотрудник ↔ сотрудник: кто кому может писать, в какой папке собеседник, вид диалога «со своей стороны».
 * Без React и базы — сервер и подменный сервер автотестов зовут одно и то же.
 */
import { normalizeStaffRole } from '../admin/adminRoleCore.js'
import { USERS_ADMIN_ROLES, USERS_SALES_MANAGER_ROLES, USERS_SUPERVISOR_ROLES, USERS_TRAINER_ROLES } from '../userRoleConstants.js'
import { CHAT_FOLDER_ADMIN, CHAT_FOLDER_COLLEAGUES } from './chatContactsCore.js'
import { CHAT_PUSH_PREVIEW_MAX, chatPreview } from './chatMessageCore.js'

export const STAFF_DM_SELF_RU = 'Нельзя написать самому себе'
export const STAFF_DM_NO_PEER_RU = 'Сотрудник не найден'
export const STAFF_DM_BLOCKED_RU = 'Сотрудник заблокирован — написать нельзя'
export const STAFF_DM_NO_ACCESS_RU = 'Нет доступа к этой переписке'
export const STAFF_DM_NO_CLUB_RU = 'У вас не задан клуб — обратитесь к администратору'

/** Главный админ — на всю сеть, без клуба; куратора нет: у него нет «Сообщений» (/messages), письмо некому было бы прочитать. */
const ROLE_VALUES = Object.freeze({
  trainer: USERS_TRAINER_ROLES,
  sales: USERS_SALES_MANAGER_ROLES,
  supervisor: USERS_SUPERVISOR_ROLES,
  admin: USERS_ADMIN_ROLES,
})

const ROLE_LABEL_RU = Object.freeze({ trainer: 'Тренер', sales: 'Менеджер по продажам', supervisor: 'Управляющий', admin: 'Главный админ' })

/**
 * Подпись собеседника-сотрудника — по роли из users или уже приведённой (staffDmRoleOf: 'sales').
 * Не chatKindLabelRu: диалог клиента «supervisor» — «Жалобы и предложения».
 */
export function staffRoleLabelRu(roleRaw) {
  return ROLE_LABEL_RU[roleRaw] ?? ROLE_LABEL_RU[staffDmRoleOf(roleRaw)] ?? 'Сотрудник'
}

/** Роль строки users для переписки; пустая или другая (куратор) — null. */
export function staffDmRoleOf(roleRaw) {
  const role = normalizeStaffRole(roleRaw)
  if (!role) return null
  for (const [key, values] of Object.entries(ROLE_VALUES)) if (values.includes(role)) return key
  return null
}

/** Папка собеседника зависит только от его роли: тренер — «Коллеги»/«Тренеры», остальные — «Администрация». */
export function staffDmFolderOf(peerRoleRaw) {
  const role = staffDmRoleOf(peerRoleRaw)
  if (!role) return null
  return role === 'trainer' ? CHAT_FOLDER_COLLEAGUES : CHAT_FOLDER_ADMIN
}

const norm = (v) => String(v ?? '').trim()

/**
 * Можно ли этой паре быть на связи: оба с ролью, не сам с собой, один клуб; с главным админом — любой клуб.
 * @param {{ id: string, role: string, club_id?: string|null }} viewer
 * @param {{ id: string, role: string, club_id?: string|null, is_active?: boolean } | null} peer
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function staffDmPairAccess(viewer, peer) {
  const me = staffDmRoleOf(viewer?.role)
  if (!me) return { ok: false, status: 403, error: STAFF_DM_NO_ACCESS_RU }
  if (!peer?.id) return { ok: false, status: 404, error: STAFF_DM_NO_PEER_RU }
  if (norm(peer.id) === norm(viewer.id)) return { ok: false, status: 400, error: STAFF_DM_SELF_RU }
  const them = staffDmRoleOf(peer.role)
  if (!them) return { ok: false, status: 403, error: STAFF_DM_NO_ACCESS_RU }
  if (me === 'admin' || them === 'admin') return { ok: true }
  const club = norm(viewer.club_id)
  if (!club) return { ok: false, status: 403, error: STAFF_DM_NO_CLUB_RU }
  if (club !== norm(peer.club_id)) return { ok: false, status: 403, error: STAFF_DM_NO_ACCESS_RU }
  return { ok: true }
}

/**
 * Читать: своя история доступна всегда, даже если собеседник сменил клуб или заблокирован.
 * Писать: только активному сотруднику, с которым пара сейчас допустима.
 */
export function canReadStaffDm(viewer, peer, threadExists) {
  if (!staffDmRoleOf(viewer?.role) || !peer?.id || norm(peer.id) === norm(viewer?.id)) return false
  return Boolean(threadExists) || staffDmPairAccess(viewer, peer).ok
}

export function staffDmWriteAccess(viewer, peer) {
  const pair = staffDmPairAccess(viewer, peer)
  if (!pair.ok) return pair
  if (peer.is_active === false) return { ok: false, status: 409, error: STAFF_DM_BLOCKED_RU }
  return { ok: true }
}

/** Пара в базе — упорядоченно, чтобы у двоих был один диалог. */
export function staffDmPair(a, b) {
  const [lo, hi] = [norm(a), norm(b)].sort()
  return { user_lo: lo, user_hi: hi }
}

/** 'lo' | 'hi' — какая колонка «прочитано» и счётчик принадлежат этому пользователю. */
export function staffDmSideOf(thread, userId) {
  const id = norm(userId)
  if (norm(thread?.user_lo) === id) return 'lo'
  if (norm(thread?.user_hi) === id) return 'hi'
  return null
}

/**
 * Диалог в виде, как его видит userId: «staff» — я, «client» — собеседник.
 * Так работают общие правила непрочитанного (isChatUnreadFor('staff', …)) и папок.
 */
export function staffDmThreadForViewer(thread, userId) {
  const mine = staffDmSideOf(thread, userId)
  if (!mine) return null
  const peer = mine === 'lo' ? 'hi' : 'lo'
  return {
    last_message_at: thread.last_message_at ?? null,
    last_author: thread.last_author ? (norm(thread.last_author) === norm(userId) ? 'staff' : 'client') : null,
    last_preview: thread.last_preview ?? '',
    staff_read_at: thread[`${mine}_read_at`] ?? null,
    client_read_at: thread[`${peer}_read_at`] ?? null,
    staff_unread: Number(thread[`${mine}_unread`]) || 0,
    client_unread: Number(thread[`${peer}_unread`]) || 0,
    last_reaction_at: thread.last_reaction_at ?? null,
    last_reaction_emoji: thread.last_reaction_emoji ?? null,
    last_reaction_side: thread.last_reaction_by ? (norm(thread.last_reaction_by) === norm(`u:${userId}`) ? 'staff' : 'client') : null,
    staff_reaction_seen_at: thread[`${mine}_reaction_seen_at`] ?? null,
  }
}

/** Сообщение для экрана: «моё» — по автору. Имя собеседника и так в шапке диалога. */
export function buildStaffDmMessageView(m, userId) {
  const mine = norm(m.author_user_id) === norm(userId)
  return {
    id: String(m.id),
    body: m.body,
    sticker: m.sticker ?? null,
    created_at: m.created_at,
    side: mine ? 'staff' : 'client',
    mine,
    author_name: '',
  }
}

/** Push собеседнику: адрес планшета, телефон тренера сам переведёт в /coach/dm (pushTargetUrlCore). */
export function buildStaffDmPushPayload({ authorId, authorName, body }) {
  return {
    title: String(authorName || 'Сотрудник клуба').trim(),
    body: chatPreview(body, CHAT_PUSH_PREVIEW_MAX),
    url: `/messages/dm/${authorId}`,
    tag: `dm-${authorId}`,
  }
}

/**
 * Кандидаты в папки «Коллеги» и «Администрация»: активные сотрудники своего клуба (у главного админа — всей сети).
 * Главный админ в списке сотрудника — только когда уже есть диалог: написал первым — можно ответить.
 * @param {Iterable<string>} [threadPeerIds] с кем у viewer уже есть диалог
 */
export function pickStaffDmPeers(viewer, users, threadPeerIds = []) {
  const withThread = new Set([...threadPeerIds].map(norm))
  const viewerIsAdmin = staffDmRoleOf(viewer?.role) === 'admin'
  const out = []
  for (const u of users ?? []) {
    if (u.is_active === false) continue
    if (!staffDmPairAccess(viewer, u).ok) continue
    if (!viewerIsAdmin && staffDmRoleOf(u.role) === 'admin' && !withThread.has(norm(u.id))) continue
    out.push(u)
  }
  return out
}
