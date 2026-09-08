/**
 * Пустая плитка «Трен.» на планшете чаще значит «строки абонемента ещё не доехали»,
 * чем «абонемента нет»: тренировку открыли раньше, чем pull принёс memberships.
 * Здесь только решение «догружать или нет» — без React и IndexedDB.
 * Verify: scripts/verify-training-membership-ensure.mjs
 */

/** Пауза между попытками для одного клиента: сеть в зале слабая, долбить её нельзя. */
export const TRAINING_MEMBERSHIP_ENSURE_RETRY_MS = 60_000

function clientKey(value) {
  return String(value ?? '').trim()
}

/**
 * Открыли черновик, а плитки пустые — стоит ли идти в облако за абонементами.
 * @param {{
 *   clientId?: string | null,
 *   status?: string,
 *   hasSummary?: boolean,
 *   membershipsCount?: number,
 *   online?: boolean,
 *   isAdmin?: boolean,
 *   lastAttemptAt?: number,
 *   now?: number,
 * }} ctx
 */
export function shouldEnsureClientMembershipsOnOpen(ctx = {}) {
  if (!clientKey(ctx.clientId)) return false
  if (ctx.online !== true) return false
  /* Админ ходит за абонементами своим контуром, здесь только планшет тренера. */
  if (ctx.isAdmin === true) return false
  if (ctx.hasSummary === true) return false
  /* Строки есть, а плитка пустая — это правило абонемента (исчерпан, не начался), не загрузка. */
  if (Number(ctx.membershipsCount ?? 0) > 0) return false
  if (String(ctx.status ?? 'draft') === 'completed') return false

  const last = Number(ctx.lastAttemptAt ?? 0)
  if (!Number.isFinite(last) || last <= 0) return true
  const now = Number(ctx.now ?? 0)
  if (!Number.isFinite(now) || now <= 0) return true
  return now - last >= TRAINING_MEMBERSHIP_ENSURE_RETRY_MS
}

/**
 * «Закончить» не нашёл, с чего списывать. Прежде чем отказать тренеру — одна попытка догрузки.
 * @param {{ planOk?: boolean, clientId?: string | null, online?: boolean, alreadyEnsured?: boolean }} ctx
 */
export function shouldEnsureClientMembershipsBeforeDebit(ctx = {}) {
  if (ctx.planOk === true) return false
  if (!clientKey(ctx.clientId)) return false
  if (ctx.online !== true) return false
  return ctx.alreadyEnsured !== true
}
