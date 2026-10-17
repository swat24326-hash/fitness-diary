/**
 * Push главному админу и управляющему клуба, если оценка ниже 4.
 */
import { isAdminByRole } from '../../../src/lib/admin/adminRoleCore.js'
import {
  adminInboxRatingsPath,
  buildStaffRatingAlertPush,
  shouldAlertStaffOnClientRating,
} from '../../../src/lib/client/clientRatingAdminCore.js'
import { USERS_ADMIN_ROLES, USERS_SUPERVISOR_ROLES } from '../../../src/lib/userRoleConstants.js'
import { isWebPushConfigured, sendPushToUser } from '../webPushCore.js'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * @param {object} db
 * @param {{ id: string, club_id?: string|null, client_id?: string, score?: number, comment?: string|null }} rating
 * @param {{ clientName?: string }} [extra]
 */
export async function notifyStaffLowClientRating(db, rating, extra = {}) {
  if (!shouldAlertStaffOnClientRating(rating?.score)) return { skipped: 'score_ok' }
  if (!isWebPushConfigured()) return { skipped: 'vapid_not_configured' }
  const clubId = String(rating.club_id ?? '').trim()
  const ratingId = String(rating.id ?? '').trim()
  if (!ratingId) return { skipped: 'no_id' }

  const [admins, supervisors, clients] = await Promise.all([
    rows(db.from('users').select('id, role, is_active').in('role', USERS_ADMIN_ROLES)),
    clubId
      ? rows(
          db
            .from('users')
            .select('id, role, is_active, club_id')
            .in('role', USERS_SUPERVISOR_ROLES)
            .eq('club_id', clubId),
        )
      : [],
    rating.client_id
      ? rows(db.from('clients').select('id, name').eq('id', rating.client_id).limit(1))
      : [],
  ])

  const clientName = extra.clientName || String(clients[0]?.name || '').trim() || 'Клиент'

  const adminIds = admins
    .filter((u) => isAdminByRole(u.role) && u.is_active !== false)
    .map((u) => String(u.id))
  const supervisorIds = supervisors
    .filter((u) => u.is_active !== false)
    .map((u) => String(u.id))

  const targets = new Map()
  for (const id of adminIds) {
    targets.set(id, adminInboxRatingsPath('/admin/inbox', { rid: ratingId }))
  }
  for (const id of supervisorIds) {
    targets.set(id, adminInboxRatingsPath('/club/inbox', { rid: ratingId }))
  }
  if (!targets.size) return { skipped: 'no_recipients', sent: 0 }

  let sent = 0
  for (const [userId, url] of targets) {
    const payload = buildStaffRatingAlertPush({
      clientName,
      score: rating.score,
      comment: rating.comment,
      url,
    })
    const r = await sendPushToUser(db, userId, payload)
    if (r?.ok && !r.skipped) sent += Number(r.sent) || 0
  }
  return { sent, recipients: targets.size }
}

/** Фоном после ответа клиента — не блокировать. */
export function scheduleStaffLowClientRatingPush(db, rating, extra) {
  if (!rating?.id) return
  void notifyStaffLowClientRating(db, rating, extra).catch((e) =>
    console.warn('[client-rating-staff-push]', e?.message || e),
  )
}
