/**
 * Кто из сотрудников может выдать клиенту вход в /me (или отключить все его входы).
 * ctx — результат requireAuthUser; client — строка clients (id, club_id, trainer_id, archived_at).
 */

const norm = (v) => String(v ?? '').trim()

export const CLIENT_INVITE_ERR = {
  noClient: 'Клиент не найден',
  archived: 'Клиент в архиве — сначала восстановите его',
  noAccess: 'Нет доступа к этому клиенту',
}

/** @returns {{ ok: true } | { ok: false, status: number, error: string }} */
export function canStaffInviteClient(ctx, client) {
  if (!client?.id) return { ok: false, status: 404, error: CLIENT_INVITE_ERR.noClient }
  if (client.archived_at) return { ok: false, status: 409, error: CLIENT_INVITE_ERR.archived }
  if (ctx?.isAdmin === true) return { ok: true }
  const ownClub = norm(ctx?.profile?.club_id)
  const sameClub = Boolean(ownClub) && ownClub === norm(client.club_id)
  if ((ctx?.isSupervisor === true || ctx?.isSalesManager === true) && sameClub) return { ok: true }
  if (ctx?.isTrainer === true && sameClub && norm(client.trainer_id) === norm(ctx?.user?.id)) {
    return { ok: true }
  }
  return { ok: false, status: 403, error: CLIENT_INVITE_ERR.noAccess }
}
