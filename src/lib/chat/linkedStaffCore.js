/**
 * Совмещённые роли: тренер и управляющий — один человек с двумя учётками (users.linked_user_id в обеих строках).
 * Связь действует только целиком: взаимная ссылка, роли тренер + управляющий, один клуб, обе учётки активны.
 * Иначе связи нет — сервер не даёт тренерской учётке действовать за управляющего. Без React и базы.
 */
import { staffDmRoleOf } from './staffDmAccessCore.js'

export const STAFF_LINK_ROLES_RU = 'Связать можно только управляющего с тренером'
export const STAFF_LINK_CLUB_RU = 'Тренер и управляющий должны быть из одного клуба'
export const STAFF_LINK_BLOCKED_RU = 'Учётка заблокирована — связать нельзя'
export const STAFF_LINK_NOT_FOUND_RU = 'Сотрудник не найден'

const norm = (v) => String(v ?? '').trim()

/**
 * @param {{ id: string, role: string, club_id?: string|null, is_active?: boolean, linked_user_id?: string|null } | null} a
 * @param {typeof a} b
 */
export function isLinkedPair(a, b) {
  if (!a?.id || !b?.id || norm(a.id) === norm(b.id)) return false
  if (norm(a.linked_user_id) !== norm(b.id) || norm(b.linked_user_id) !== norm(a.id)) return false
  const roles = [staffDmRoleOf(a.role), staffDmRoleOf(b.role)].sort().join('+')
  if (roles !== 'supervisor+trainer') return false
  const club = norm(a.club_id)
  if (!club || club !== norm(b.club_id)) return false
  return a.is_active !== false && b.is_active !== false
}

/** Учётка управляющего, за которую может действовать тренерская учётка me; иначе null. */
export function linkedSupervisorFor(me, linked) {
  if (staffDmRoleOf(me?.role) !== 'trainer') return null
  return isLinkedPair(me, linked) ? linked : null
}

/** Тренерские учётки связанных пар: для коллег человек один — управляющий. */
export function hiddenLinkedTrainerIds(users) {
  const byId = new Map((users ?? []).map((u) => [norm(u.id), u]))
  const out = new Set()
  for (const u of users ?? []) {
    if (staffDmRoleOf(u.role) !== 'trainer') continue
    if (isLinkedPair(u, byId.get(norm(u.linked_user_id)))) out.add(norm(u.id))
  }
  return out
}

/**
 * Кому ещё слать push: тренерские учётки получателей-управляющих (Кукарек ходит с планшетом тренера).
 * @param {object[]} recipients строки users получателей
 * @param {object[]} linked строки users, на которые ссылаются получатели
 * @returns {string[]}
 */
export function linkedTrainerRecipientIds(recipients, linked) {
  const byId = new Map((linked ?? []).map((u) => [norm(u.id), u]))
  const out = []
  for (const r of recipients ?? []) {
    if (staffDmRoleOf(r.role) !== 'supervisor') continue
    const t = byId.get(norm(r.linked_user_id))
    if (t && isLinkedPair(r, t)) out.push(norm(t.id))
  }
  return out
}

/**
 * Можно ли админу связать управляющего с тренером. trainer = null — снять связь (проверяем только управляющего).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function staffLinkCheck(supervisor, trainer) {
  if (!supervisor) return { ok: false, error: STAFF_LINK_NOT_FOUND_RU }
  if (staffDmRoleOf(supervisor.role) !== 'supervisor') return { ok: false, error: STAFF_LINK_ROLES_RU }
  if (trainer === null) return { ok: true }
  if (!trainer) return { ok: false, error: STAFF_LINK_NOT_FOUND_RU }
  if (staffDmRoleOf(trainer.role) !== 'trainer') return { ok: false, error: STAFF_LINK_ROLES_RU }
  const club = norm(supervisor.club_id)
  if (!club || club !== norm(trainer.club_id)) return { ok: false, error: STAFF_LINK_CLUB_RU }
  if (supervisor.is_active === false || trainer.is_active === false) return { ok: false, error: STAFF_LINK_BLOCKED_RU }
  return { ok: true }
}

/** Пары «управляющий → тренер» для экрана «Структура». */
export function staffLinksOf(users) {
  const byId = new Map((users ?? []).map((u) => [norm(u.id), u]))
  const out = []
  for (const u of users ?? []) {
    if (staffDmRoleOf(u.role) !== 'supervisor') continue
    const t = byId.get(norm(u.linked_user_id))
    if (t && isLinkedPair(u, t)) out.push({ supervisor_id: norm(u.id), trainer_id: norm(t.id) })
  }
  return out
}
