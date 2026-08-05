/**
 * Подписи строк журнала удалений (UI).
 */

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
export function formatDeletionAuditActor(row) {
  const name = String(row?.deleted_by_name ?? '').trim()
  const role = String(row?.deleted_by_role ?? '').trim()
  if (name && role) return `${name} (${role})`
  if (name) return name
  if (role) return role
  return '—'
}

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
export function formatDeletionAuditClient(row) {
  const name = String(row?.entity_name ?? '').trim() || 'Без имени'
  const card = String(row?.entity_card_number ?? '').trim()
  return card ? `${name} · № ${card}` : name
}

/**
 * @param {object|null|undefined} meta
 * @returns {string}
 */
export function formatDeletionAuditMeta(meta) {
  if (!meta || typeof meta !== 'object') return '—'
  const t = meta.trainings_count
  const m = meta.memberships_count
  const parts = []
  if (typeof t === 'number') parts.push(`трен. ${t}`)
  if (typeof m === 'number') parts.push(`абонов ${m}`)
  if (meta.was_archived) parts.push('был в архиве')
  return parts.length ? parts.join(' · ') : '—'
}
