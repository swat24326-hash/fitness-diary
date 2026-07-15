import { isSupabaseConfigured } from '../supabase'
import { getDb, putStore, listSyncQueue } from '../localDb'
import { saveLocalWithSync } from '../syncService'
import { pushRecordViaApi } from '../syncApiClient'
import { markRecordFromCloud, recordForPush } from '../syncUnsyncedCore'
import { HOMEWORK_PRESET_SEED } from './homeworkPresetCatalog.js'
import {
  normalizeHomeworkPresetRow,
  enrichHomeworkBlocksWithCatalog,
  buildPendingHomeworkPresetKeys,
  shouldApplyRemoteHomeworkPresetRow,
  shouldDeleteLocalHomeworkPresetRow,
} from './homeworkPresetsCore.js'

export { enrichHomeworkBlocksWithCatalog }

async function pushPresetOp(operation, row, remoteId) {
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { cloudOk: false, cloudError: 'Нет сети — шаблон только на этом устройстве. Нажмите Sync позже.' }
  }
  const push = await pushRecordViaApi({
    table_name: 'homework_presets',
    operation,
    data: recordForPush(row),
    remote_id: remoteId ?? row.id ?? null,
    local_id: null,
  })
  return push.ok
    ? { cloudOk: true, record: push.record }
    : { cloudOk: false, cloudError: push.error ?? 'Не удалось отправить в облако' }
}

/** @param {string} clubId @param {{ activeOnly?: boolean }} [opts] */
export async function listHomeworkPresetsForClub(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  const db = await getDb()
  let list = (await db.getAll('homework_presets')).filter((r) => String(r.club_id) === cid)
  if (opts.activeOnly) list = list.filter((r) => r.is_active !== false)
  return list
    .map((r) => normalizeHomeworkPresetRow(r))
    .filter(Boolean)
    .sort((a, b) => (a.sort_order - b.sort_order) || a.title.localeCompare(b.title, 'ru'))
}

/**
 * @param {{
 *   club_id: string,
 *   title: string,
 *   direction?: string,
 *   description?: string | null,
 *   items?: { blocks: object[] },
 *   sort_order?: number,
 * }} input
 */
export async function insertHomeworkPreset(input) {
  const row = normalizeHomeworkPresetRow({
    id: crypto.randomUUID(),
    club_id: input.club_id,
    title: input.title,
    direction: input.direction ?? '',
    description: input.description ?? null,
    items: input.items ?? { blocks: [] },
    sort_order: input.sort_order ?? 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (!row) return { cloudOk: false, cloudError: 'Некорректные данные шаблона' }

  await saveLocalWithSync('homework_presets', row, {
    table_name: 'homework_presets',
    operation: 'insert',
    remote_id: null,
  })
  return pushPresetOp('insert', row, null)
}

/**
 * @param {string} id
 * @param {Partial<{ title: string, direction: string, description: string | null, items: object, sort_order: number, is_active: boolean }>} patch
 */
export async function updateHomeworkPreset(id, patch) {
  const pid = String(id ?? '').trim()
  if (!pid) return { cloudOk: false, cloudError: 'Нет id' }
  const db = await getDb()
  const prev = await db.get('homework_presets', pid)
  if (!prev) return { cloudOk: false, cloudError: 'Шаблон не найден' }
  const row = normalizeHomeworkPresetRow({
    ...prev,
    ...patch,
    id: pid,
    club_id: prev.club_id,
    updated_at: new Date().toISOString(),
  })
  if (!row) return { cloudOk: false, cloudError: 'Некорректные данные шаблона' }
  await saveLocalWithSync('homework_presets', row, {
    table_name: 'homework_presets',
    operation: 'update',
    remote_id: pid,
  })
  return pushPresetOp('update', row, pid)
}

/** @param {string} id */
export async function deactivateHomeworkPreset(id) {
  return updateHomeworkPreset(id, { is_active: false })
}

/** @param {string} clubId — вставить 5 базовых шаблонов, если клуб пуст */
export async function seedDefaultHomeworkPresetsForClub(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { count: 0, cloudOk: false, cloudError: 'Нет клуба' }
  const existing = await listHomeworkPresetsForClub(cid, { activeOnly: false })
  if (existing.length > 0) return { count: 0, cloudOk: true, skipped: true }

  let catalog = []
  try {
    const { listExercises } = await import('../dataAccess')
    catalog = await listExercises()
  } catch {
    catalog = []
  }

  let lastError = null
  for (let i = 0; i < HOMEWORK_PRESET_SEED.length; i++) {
    const p = HOMEWORK_PRESET_SEED[i]
    const items = enrichHomeworkBlocksWithCatalog({ blocks: p.blocks }, catalog)
    const res = await insertHomeworkPreset({
      club_id: cid,
      title: p.title,
      direction: p.direction,
      description: p.description,
      items,
      sort_order: i,
    })
    if (!res.cloudOk && res.cloudError && !/Нет сети/i.test(String(res.cloudError))) {
      lastError = res.cloudError
    }
  }
  const after = await listHomeworkPresetsForClub(cid, { activeOnly: false })
  return {
    count: after.length,
    cloudOk: after.length > 0,
    cloudError: lastError ?? undefined,
    seeded: after.length > 0,
  }
}

/** @param {string} clubId @param {object[]} remoteRows @param {{ forceFromCloud?: boolean }} [opts] */
export async function mergeHomeworkPresetsForClub(clubId, remoteRows, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { count: 0 }
  const forceFromCloud = opts.forceFromCloud === true
  const { pendingUpdates, pendingInserts } = buildPendingHomeworkPresetKeys(await listSyncQueue())

  const remoteIds = new Set()
  let count = 0
  for (const raw of remoteRows ?? []) {
    const row = normalizeHomeworkPresetRow(raw)
    if (!row || row.club_id !== cid) continue
    remoteIds.add(row.id)
    if (!shouldApplyRemoteHomeworkPresetRow({ id: row.id, forceFromCloud, pendingUpdates, pendingInserts })) continue
    await putStore('homework_presets', markRecordFromCloud(row))
    count++
  }

  if (remoteIds.size > 0) {
    const db = await getDb()
    for (const local of await db.getAll('homework_presets')) {
      if (String(local.club_id) !== cid) continue
      const id = String(local.id)
      if (
        shouldDeleteLocalHomeworkPresetRow({
          id,
          remoteIds,
          forceFromCloud,
          pendingUpdates,
          pendingInserts,
        })
      ) {
        await db.delete('homework_presets', id)
      }
    }
  }
  return { count }
}

export function notifyHomeworkPresetsChanged(clubId, detail = {}) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('fitness-diary-storage', {
        detail: { reason: 'homework-presets', clubId, ...detail },
      }),
    )
  } catch {
    /* ignore */
  }
}
