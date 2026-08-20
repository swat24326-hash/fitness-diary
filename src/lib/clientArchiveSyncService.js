/**
 * Локальное сохранение архива / причины через sync (офлайн-first).
 */
import { getDb } from './localDb.js'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  saveLocalWithSync,
} from './syncService.js'
import {
  buildArchiveEnterFields,
  buildArchiveReasonOnlyFields,
  buildArchiveRestoreFields,
} from './clientArchiveReasonCore.js'

/**
 * @param {object} clientRow
 * @param {Record<string, unknown>} fields
 * @param {string} actionLabel
 * @param {{ requireArchived?: boolean }} [opts]
 * @returns {Promise<{ row: object, warn: string | null }>}
 */
async function persistClientFields(clientRow, fields, actionLabel, opts = {}) {
  if (!clientRow?.id) throw new Error('Клиент не найден')
  let base = null
  try {
    const db = await getDb()
    base = await db.get('clients', clientRow.id)
  } catch {
    /* нет доступа к IDB */
  }
  if (!base?.id) {
    throw new Error('Клиент не найден в локальном кэше. Обновите список (Sync) и повторите.')
  }
  if (opts.requireArchived && !base.archived_at) {
    throw new Error('Клиент уже не в архиве. Обновите список.')
  }
  const row = { ...base, ...fields }
  await saveLocalWithSync('clients', row, {
    table_name: 'clients',
    operation: 'update',
    remote_id: base.id,
  })
  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, actionLabel)
  return { row, warn }
}

/**
 * Убрать в архив с обязательной причиной.
 * @param {object} clientRow
 * @param {string|{ reason?: string, expectedReturnOn?: string|null }} reasonInput
 */
export async function archiveClientWithReason(clientRow, reasonInput) {
  const built = buildArchiveEnterFields(reasonInput)
  if (!built.ok) throw new Error(built.error)
  return persistClientFields(clientRow, built.patch, 'Архив')
}

/**
 * Вернуть из архива — дата, причина и срок ожидания очищаются.
 * @param {object} clientRow
 */
export async function restoreClientFromArchive(clientRow) {
  return persistClientFields(clientRow, buildArchiveRestoreFields(), 'Возврат из архива')
}

/**
 * Дописать / сменить причину у уже архивного.
 * @param {object} clientRow
 * @param {string|{ reason?: string, expectedReturnOn?: string|null }} reasonInput
 */
export async function setClientArchiveReason(clientRow, reasonInput) {
  const built = buildArchiveReasonOnlyFields(reasonInput)
  if (!built.ok) throw new Error(built.error)
  return persistClientFields(clientRow, built.patch, 'Причина архива', { requireArchived: true })
}
