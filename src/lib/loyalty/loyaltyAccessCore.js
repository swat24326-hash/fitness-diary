/**
 * Кто может читать/писать лояльность. Без React / fetch.
 */

export const LOYALTY_ERR = {
  noClub: 'Укажите club_id',
  noClient: 'Нет доступа к этому клиенту.',
  noAccess: 'Нет доступа',
  trainerRedeem: 'Списать баллы может менеджер или администратор.',
  stalePoints: 'Цифра устарела. Обновите карточку и спишите снова.',
  programOff: 'Программа лояльности в клубе выключена.',
  cannotRedeem: 'Куш ещё нельзя списать (срок или нет баллов).',
  tooManyIds: 'Слишком много id (макс. 200)',
  needIds: 'Укажите ids',
  needClient: 'Укажите client_id',
}

export const LOYALTY_GLANCE_MAX_IDS = 200
export const LOYALTY_REDEEM_COMMENT_MAX = 200

function ownClubId(ctx) {
  return String(
    ctx?.supervisorClubId ?? ctx?.salesClubId ?? ctx?.profile?.club_id ?? ctx?.user?.club_id ?? '',
  ).trim()
}

function callerId(ctx) {
  return String(ctx?.profile?.id ?? ctx?.user?.id ?? '').trim()
}

function deny(status, error) {
  return { ok: false, status, error }
}

/**
 * @param {object} ctx
 * @param {string} clubId
 */
export function assertLoyaltyClubRole(ctx, clubId) {
  const id = String(clubId ?? '').trim()
  if (!id) return deny(400, LOYALTY_ERR.noClub)
  if (ctx?.isAdmin === true) return { ok: true, clubId: id }
  if (ctx?.isTrainer !== true && ctx?.isSalesManager !== true && ctx?.isSupervisor !== true) {
    return deny(403, LOYALTY_ERR.noAccess)
  }
  const own = ownClubId(ctx)
  if (!own || own !== id) return deny(403, LOYALTY_ERR.noAccess)
  return { ok: true, clubId: id }
}

/** GET settings: роли своего клуба. */
export function assertLoyaltySettingsGet(ctx, clubId) {
  return assertLoyaltyClubRole(ctx, clubId)
}

/** POST settings: только admin. */
export function assertLoyaltySettingsPost(ctx, clubId) {
  const id = String(clubId ?? '').trim()
  if (!id) return deny(400, LOYALTY_ERR.noClub)
  if (ctx?.isAdmin !== true) return deny(403, LOYALTY_ERR.noAccess)
  return { ok: true, clubId: id }
}

/**
 * Карточка / glance: тренер — только свои клиенты клуба; sales/supervisor/admin — клуб.
 * @param {object} ctx
 * @param {{ clubId?: string, clientClubId?: string, clientTrainerId?: string }} client
 */
export function assertLoyaltyAccountAccess(ctx, client = {}) {
  const clubId = String(client.clubId ?? client.clientClubId ?? '').trim()
  const club = assertLoyaltyClubRole(ctx, clubId)
  if (!club.ok) {
    if (club.status === 400) return deny(403, LOYALTY_ERR.noClient)
    return deny(403, LOYALTY_ERR.noClient)
  }
  if (ctx?.isAdmin === true || ctx?.isSalesManager === true || ctx?.isSupervisor === true) {
    return { ok: true, clubId }
  }
  const trainerId = callerId(ctx)
  const clientTrainer = String(client.clientTrainerId ?? '').trim()
  if (!trainerId || trainerId !== clientTrainer) return deny(403, LOYALTY_ERR.noClient)
  return { ok: true, clubId }
}

/** Redeem / журнал: sales_manager или admin. */
export function assertLoyaltyRedeemAccess(ctx, clubId) {
  const id = String(clubId ?? '').trim()
  if (!id) return deny(400, LOYALTY_ERR.noClub)
  if (ctx?.isTrainer === true && ctx?.isAdmin !== true) return deny(403, LOYALTY_ERR.trainerRedeem)
  if (ctx?.isAdmin === true) return { ok: true, clubId: id }
  if (ctx?.isSalesManager === true) {
    const own = ownClubId(ctx)
    if (!own || own !== id) return deny(403, LOYALTY_ERR.noAccess)
    return { ok: true, clubId: id }
  }
  return deny(403, LOYALTY_ERR.trainerRedeem)
}

export function assertLoyaltyJournalAccess(ctx, clubId) {
  return assertLoyaltyRedeemAccess(ctx, clubId)
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, ids: string[] } | { ok: false, status: number, error: string }}
 */
export function parseLoyaltyGlanceIds(raw) {
  let list = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === 'string') list = raw.split(/[,\s]+/)
  const ids = [...new Set(list.map((x) => String(x ?? '').trim()).filter(Boolean))]
  if (!ids.length) return deny(400, LOYALTY_ERR.needIds)
  if (ids.length > LOYALTY_GLANCE_MAX_IDS) return deny(400, LOYALTY_ERR.tooManyIds)
  return { ok: true, ids }
}

export function clipLoyaltyRedeemComment(raw) {
  return String(raw ?? '').trim().slice(0, LOYALTY_REDEEM_COMMENT_MAX)
}
