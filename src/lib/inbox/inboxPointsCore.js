/**
 * Баллы за опросы клиента: начислены при ответе, не сгорают, списываются на стойке.
 * Отдельный счёт от копилки ПЗ. Канон: docs/INBOX.md. Без React / IDB.
 */

export const SURVEY_POINTS_COMMENT_MAX = 200
export const SURVEY_POINTS_HISTORY_MAX = 20

export const SURVEY_POINTS_ERR = Object.freeze({
  noAccess: 'Нет доступа к баллам этого клиента',
  noRedeem: 'Списывают баллы администратор и менеджер продаж',
  amount: 'Укажите, сколько баллов списать',
  tooMuch: 'Столько баллов у клиента нет',
  changed: 'Баланс изменился — обновите и проверьте ещё раз',
})

function ownClubId(ctx) {
  return String(ctx?.profile?.club_id ?? '').trim()
}

/** Смотреть баланс: админ — любой клуб; менеджер продаж и управляющий — только свой. Тренер — нет. */
export function canViewSurveyPoints(ctx, clubId) {
  if (ctx?.isAdmin) return true
  if (!ctx?.isSalesManager && !ctx?.isSupervisor) return false
  const own = ownClubId(ctx)
  return Boolean(own) && own === String(clubId ?? '').trim()
}

/** Списать: админ — любой клуб; менеджер продаж — свой (как подарок за баллы ПЗ). */
export function canRedeemSurveyPoints(ctx, clubId) {
  if (ctx?.isAdmin) return true
  return Boolean(ctx?.isSalesManager) && canViewSurveyPoints(ctx, clubId)
}

/**
 * @param {Array<{ reward_points?: number, reward_granted_at?: string|null }>} deliveries
 * @param {Array<{ points?: number }>} redemptions
 */
export function computeSurveyPoints(deliveries, redemptions) {
  const earned = (deliveries ?? [])
    .filter((d) => d?.reward_granted_at)
    .reduce((s, d) => s + Math.max(0, Math.trunc(Number(d.reward_points) || 0)), 0)
  const redeemed = (redemptions ?? []).reduce((s, r) => s + Math.max(0, Math.trunc(Number(r?.points) || 0)), 0)
  return { earned, redeemed, balance: Math.max(0, earned - redeemed) }
}

/**
 * Списание: целое > 0, не больше баланса; expected_balance — защита от двойного нажатия и устаревшего экрана.
 * @returns {{ ok: true, points: number } | { ok: false, status: number, error: string }}
 */
export function decideSurveyPointsRedeem({ balance, points, expected_balance }) {
  const n = Math.trunc(Number(points))
  if (!Number.isFinite(n) || n <= 0) return { ok: false, status: 400, error: SURVEY_POINTS_ERR.amount }
  if (Math.trunc(Number(expected_balance)) !== balance) return { ok: false, status: 409, error: SURVEY_POINTS_ERR.changed }
  if (n > balance) return { ok: false, status: 409, error: SURVEY_POINTS_ERR.tooMuch }
  return { ok: true, points: n }
}

export function clipSurveyPointsComment(raw) {
  return String(raw ?? '').trim().slice(0, SURVEY_POINTS_COMMENT_MAX)
}

/**
 * Лента для стойки: «+50 · Как вам клуб?» и «−100 · полотенце», новые сверху.
 * @param {Array<{ reward_points: number, reward_granted_at: string, title?: string }>} grants
 * @param {Array<{ points: number, created_at: string, comment?: string }>} redemptions
 */
export function surveyPointsHistory(grants, redemptions) {
  const rows = [
    ...(grants ?? []).map((g) => ({ at: g.reward_granted_at, delta: Number(g.reward_points) || 0, label: g.title || 'Опрос' })),
    ...(redemptions ?? []).map((r) => ({ at: r.created_at, delta: -(Number(r.points) || 0), label: r.comment || 'Списание на стойке' })),
  ]
  return rows
    .filter((r) => r.delta !== 0 && r.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, SURVEY_POINTS_HISTORY_MAX)
}
