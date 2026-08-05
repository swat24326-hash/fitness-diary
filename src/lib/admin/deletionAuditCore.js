/**
 * Чистая сборка строки журнала удалений (без DB).
 */

/**
 * @param {{
 *   entityTable?: string,
 *   entityId?: string,
 *   clubId?: string | null,
 *   entityName?: string | null,
 *   entityCardNumber?: string | null,
 *   entityPhone?: string | null,
 *   trainerId?: string | null,
 *   trainerName?: string | null,
 *   deletedBy?: string | null,
 *   deletedByName?: string | null,
 *   deletedByRole?: string | null,
 *   source?: string,
 *   meta?: Record<string, unknown>,
 * }} p
 * @returns {object | null}
 */
export function buildDeletionAuditInsertRow(p) {
  const entity_table = String(p?.entityTable ?? '').trim()
  const entity_id = String(p?.entityId ?? '').trim()
  if (entity_table !== 'clients' || !entity_id) return null

  const sourceRaw = String(p?.source ?? 'push').trim()
  const source = ['push', 'pnk_api', 'admin_api'].includes(sourceRaw) ? sourceRaw : 'push'

  const clip = (v, n) => {
    const s = String(v ?? '').trim()
    if (!s) return null
    return s.length > n ? s.slice(0, n) : s
  }

  return {
    club_id: String(p?.clubId ?? '').trim() || null,
    entity_table,
    entity_id,
    entity_name: clip(p?.entityName, 200),
    entity_card_number: clip(p?.entityCardNumber, 40),
    entity_phone: clip(p?.entityPhone, 40),
    trainer_id: String(p?.trainerId ?? '').trim() || null,
    trainer_name: clip(p?.trainerName, 120),
    deleted_by: String(p?.deletedBy ?? '').trim() || null,
    deleted_by_name: clip(p?.deletedByName, 120),
    deleted_by_role: clip(p?.deletedByRole, 40),
    source,
    meta: p?.meta && typeof p.meta === 'object' && !Array.isArray(p.meta) ? p.meta : {},
  }
}

/**
 * Подпись роли для журнала.
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isTrainer?: boolean, profile?: { role?: string } }} ctx
 */
export function deletionActorRoleLabel(ctx) {
  if (ctx?.isAdmin) return 'admin'
  if (ctx?.isSalesManager) return 'sales_manager'
  if (ctx?.isTrainer) return 'trainer'
  const r = String(ctx?.profile?.role ?? '').trim()
  return r || 'unknown'
}
