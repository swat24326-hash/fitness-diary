import { saveLocalWithSync } from '../syncService.js'
import { applyPnkStagePatch, buildNewPnkClientFields } from './pnkStagesCore.js'
import { normalizeClientPnkFields } from './pnkClientFields.js'

/**
 * Локальное обновление ПНК на планшете тренера (очередь sync).
 * @param {object} client
 * @param {object} patch — поля applyPnkStagePatch
 */
export async function patchPnkClientLocal(client, patch = {}) {
  const base = normalizeClientPnkFields(client)
  const result = applyPnkStagePatch({
    client: base,
    ...patch,
    by_role: patch.by_role || 'trainer',
  })
  if (!result.ok) return result
  await saveLocalWithSync('clients', result.client, {
    table_name: 'clients',
    operation: 'update',
    remote_id: result.client.id,
  })
  return { ok: true, client: result.client }
}

/**
 * Создать клиента сразу как ПНК (тренер / соцсеть).
 * @param {object} row — уже собранная строка clients без lifecycle
 */
export function withPnkFieldsForInsert(row, source = 'trainer') {
  return normalizeClientPnkFields({
    ...row,
    ...buildNewPnkClientFields({
      trainer_id: row.trainer_id,
      pnk_source: source,
    }),
  })
}
