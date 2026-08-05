/**
 * Запись в deletion_audit_log перед hard delete клиента (service role).
 * Ошибка аудита не блокирует удаление — только warning в лог.
 */

import { buildDeletionAuditInsertRow, deletionActorRoleLabel } from '../../src/lib/admin/deletionAuditCore.js'

/**
 * @param {object} ctx — requireAuthUser
 * @param {string} clientId
 * @param {object | null | undefined} dataHint — payload из очереди sync
 * @param {{ source?: string }} [opts]
 */
export async function recordClientDeletionAudit(ctx, clientId, dataHint, opts = {}) {
  const supabaseAdmin = ctx?.supabaseAdmin
  const cid = String(clientId ?? '').trim()
  if (!supabaseAdmin || !cid) return { ok: false, reason: 'no_ctx' }

  let snap = dataHint && typeof dataHint === 'object' ? { ...dataHint } : {}
  const needFetch = !String(snap.name ?? '').trim() || !String(snap.club_id ?? '').trim()
  if (needFetch) {
    try {
      const { data, error } = await supabaseAdmin
        .from('clients')
        .select('id, name, phone, card_number, club_id, trainer_id, desk_hall, archived_at')
        .eq('id', cid)
        .maybeSingle()
      if (!error && data) snap = { ...data, ...snap }
    } catch (e) {
      console.warn('[deletion-audit] fetch client', e)
    }
  }

  let trainerName = null
  const trainerId = String(snap.trainer_id ?? '').trim() || null
  if (trainerId) {
    try {
      const { data: tr } = await supabaseAdmin.from('users').select('name').eq('id', trainerId).maybeSingle()
      trainerName = tr?.name ?? null
    } catch {
      /* ignore */
    }
  }

  let trainingsCount = null
  let membershipsCount = null
  const hintAudit = dataHint?.__audit
  if (hintAudit && typeof hintAudit === 'object') {
    if (typeof hintAudit.trainings_count === 'number') trainingsCount = hintAudit.trainings_count
    if (typeof hintAudit.memberships_count === 'number') membershipsCount = hintAudit.memberships_count
  }
  if (trainingsCount == null || membershipsCount == null) {
    try {
      const [tRes, mRes] = await Promise.all([
        supabaseAdmin.from('trainings').select('id', { count: 'exact', head: true }).eq('client_id', cid),
        supabaseAdmin.from('memberships').select('id', { count: 'exact', head: true }).eq('client_id', cid),
      ])
      if (trainingsCount == null) trainingsCount = typeof tRes.count === 'number' ? tRes.count : null
      if (membershipsCount == null) membershipsCount = typeof mRes.count === 'number' ? mRes.count : null
    } catch {
      /* ignore */
    }
  }

  const actorId = String(ctx.user?.id ?? '').trim() || null
  let actorName = String(ctx.profile?.name ?? '').trim() || null
  if (!actorName && actorId) {
    try {
      const { data: u } = await supabaseAdmin.from('users').select('name').eq('id', actorId).maybeSingle()
      actorName = u?.name ?? null
    } catch {
      /* ignore */
    }
  }

  const row = buildDeletionAuditInsertRow({
    entityTable: 'clients',
    entityId: cid,
    clubId: snap.club_id,
    entityName: snap.name,
    entityCardNumber: snap.card_number,
    entityPhone: snap.phone,
    trainerId,
    trainerName,
    deletedBy: actorId,
    deletedByName: actorName,
    deletedByRole: deletionActorRoleLabel(ctx),
    source: opts.source || 'push',
    meta: {
      trainings_count: trainingsCount,
      memberships_count: membershipsCount,
      desk_hall: snap.desk_hall ?? null,
      was_archived: Boolean(snap.archived_at),
    },
  })
  if (!row) return { ok: false, reason: 'bad_row' }

  try {
    const { error } = await supabaseAdmin.from('deletion_audit_log').insert(row)
    if (error) {
      console.warn('[deletion-audit] insert', error.message)
      return { ok: false, reason: error.message }
    }
    return { ok: true }
  } catch (e) {
    console.warn('[deletion-audit] insert throw', e)
    return { ok: false, reason: e?.message ? String(e.message) : 'insert_failed' }
  }
}
