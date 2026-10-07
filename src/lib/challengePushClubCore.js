/**
 * Челлендж — справочник клуба. Push пишет service role в обход RLS, поэтому клуб сверяется
 * со строкой в базе: иначе свой club_id в payload + чужой id перезаписывает челлендж другого клуба.
 */

const norm = (v) => String(v ?? '').trim()
const DENY = { ok: false, error: 'Челлендж другого клуба' }

/**
 * @param {{ op: string, profileClubId?: unknown, row?: { club_id?: unknown } | null, payload?: object | null }} p
 *   row — строка из базы по id (null, если её нет)
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertChallengeClub({ op, profileClubId, row, payload }) {
  const mine = norm(profileClubId)
  if (row) {
    if (norm(row.club_id) !== mine) return DENY
    if (op === 'delete') return { ok: true }
  } else if (op === 'delete') {
    return { ok: true }
  }
  const p = payload ?? {}
  const asksClub = !row || Object.prototype.hasOwnProperty.call(p, 'club_id')
  if (asksClub && norm(/** @type {any} */ (p).club_id) !== mine) return DENY
  return { ok: true }
}
