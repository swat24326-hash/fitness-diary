/**
 * Строка «одна на клиента» (настройки авто-ДЗ, анкета здоровья): пишет тренер клиента или главный админ,
 * id строки — постоянный от client_id, удаления нет.
 * @param {{ op: string, isAdmin?: boolean, isTrainer?: boolean, userId: string, payload: object, remoteId?: string|null,
 *   client: object|null, rowId: (clientId: string) => string, what: { noDelete: string, who: string, bad: string } }} p
 */
export function assertTrainerClientRowPush({ op, isAdmin = false, isTrainer = false, userId, payload, remoteId = null, client, rowId, what }) {
  if (op !== 'insert' && op !== 'update') return { ok: false, error: what.noDelete }
  if (!isAdmin && !isTrainer) return { ok: false, error: what.who }
  if (String(payload?.updated_by ?? '') !== String(userId ?? '')) return { ok: false, error: 'Изменения должны быть от вашего имени' }
  if (String(payload?.id ?? '') !== rowId(payload?.client_id)) return { ok: false, error: what.bad }
  if (op === 'update' && String(remoteId ?? '') !== String(payload.id)) return { ok: false, error: what.bad }
  if (!client) return { ok: false, error: 'Клиент не найден' }
  if (client.archived_at) return { ok: false, error: 'Клиент в архиве' }
  if (!isAdmin && String(client.trainer_id ?? '') !== String(userId)) return { ok: false, error: 'Нет доступа к клиенту' }
  const clientClub = String(client.club_id ?? '')
  if (clientClub && String(payload?.club_id ?? '') !== clientClub) return { ok: false, error: 'Клуб не совпадает с клубом клиента' }
  return { ok: true }
}
