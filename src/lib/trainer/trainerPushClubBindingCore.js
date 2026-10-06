/**
 * Тренер не пишет clients / trainings / memberships в чужой клуб — как RLS WITH CHECK в policies.sql.
 * Push пишет service role в обход RLS, поэтому правило повторяется на API.
 * Допустимы: клуб профиля, клуб своего клиента (перевод тренера между клубами), клуб уже лежащей строки.
 * Пустой club_id не трогаем: чужой клуб так не получить, а подстановка разошлась бы с копией на планшете.
 */

const norm = (v) => String(v ?? '').trim()

/**
 * @param {{ profileClubId?: unknown, clientClubId?: unknown, existingClubId?: unknown, payloadClubId?: unknown }} p
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertTrainerClubId({ profileClubId, clientClubId, existingClubId, payloadClubId }) {
  const asked = norm(payloadClubId)
  if (!asked) return { ok: true }
  if ([profileClubId, clientClubId, existingClubId].some((c) => norm(c) === asked)) return { ok: true }
  return { ok: false, error: 'Нельзя записать в другой клуб' }
}

/** Клуб клиента нужен, только если payload указал клуб не из профиля и не из строки. */
export function needsClientClubForTrainerCheck({ profileClubId, existingClubId, payloadClubId }) {
  const asked = norm(payloadClubId)
  return Boolean(asked) && asked !== norm(profileClubId) && asked !== norm(existingClubId)
}
