import { todayLocalIso } from './dateRu.js'
import { saveLocalWithSync, deleteLocalWithSync } from './syncService.js'
import { listWeightEntriesByClientId } from './localDbClubQuery.js'
import {
  findBaselineWeightEntry,
  filterWeightEntriesForDisplay,
  getHealthFilledAt,
  listBaselineLikeEntries,
  mergeHealthCardPersistRow,
  normalizeHealthSex,
  parseHealthFilledAt,
  resolveHealthFilledAtOnSave,
} from './healthCardCore.js'
import {
  applyHealthWeightPatch,
  getHealthCurrentWeightKg,
  getHealthInitialWeightKg,
  normalizeHealthCardWeights,
  normalizeWeightEntryRow,
  parseWeightKg,
  pickLatestTrainingPreWeight,
} from './clientWeightCore.js'

export { listWeightEntriesByClientId } from './localDbClubQuery.js'

/**
 * @param {string} clientId
 * @param {object | null} [health]
 */
export async function listWeightEntries(clientId, health = null) {
  await repairBaselineWeightEntries(clientId, health)
  const rows = await listWeightEntriesByClientId(clientId)
  const normalized = rows.map(normalizeWeightEntryRow)
  return filterWeightEntriesForDisplay(normalized, health)
}

/**
 * @param {string} clientId
 * @param {object | null} health
 * @param {{ weightKg: number, date?: string, note?: string | null }} opts
 */
export async function recordManualWeight(clientId, health, opts) {
  const weightKg = parseWeightKg(opts.weightKg)
  if (weightKg == null) throw new Error('Укажите корректный вес')
  const date = String(opts.date ?? todayLocalIso()).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Некорректная дата')

  const normalizedHealth = normalizeHealthCardWeights(health)
  const entry = await saveWeightEntry({
    clientId,
    date,
    weightKg,
    source: 'manual',
    trainingId: null,
    note: opts.note ?? null,
  })
  await updateHealthCurrentWeight(clientId, normalizedHealth, weightKg)
  return entry
}

/**
 * @param {string} clientId
 * @param {object | null} health
 * @param {object[]} trainings
 */
export async function recordWeightFromLatestTraining(clientId, health, trainings) {
  const picked = pickLatestTrainingPreWeight(trainings)
  if (!picked) throw new Error('Нет завершённой тренировки с весом')

  const normalizedHealth = normalizeHealthCardWeights(health)
  const entry = await saveWeightEntry({
    clientId,
    date: picked.date || todayLocalIso(),
    weightKg: picked.weightKg,
    source: 'training',
    trainingId: picked.training?.id ?? null,
    note: null,
  })
  await updateHealthCurrentWeight(clientId, normalizedHealth, picked.weightKg)
  return { entry, training: picked.training }
}

/**
 * Сохранение медкарты: пол, дата составления, исходный вес (одна baseline-точка в истории).
 * @param {string} clientId
 * @param {object | null} health
 * @param {Record<string, unknown>} formFields
 */
export async function saveHealthCardWithWeightFields(clientId, health, formFields) {
  const normalized = normalizeHealthCardWeights(health)
  const prevInitial = getHealthInitialWeightKg(normalized)
  const prevCurrent = getHealthCurrentWeightKg(normalized)

  const toNumOrNull = (v) => parseWeightKg(v)
  const nextInitial = toNumOrNull(formFields.initial_weight_kg) ?? prevInitial
  let nextCurrent = prevCurrent
  if (nextCurrent == null && nextInitial != null) nextCurrent = nextInitial

  const healthFilledAt = resolveHealthFilledAtOnSave(
    getHealthFilledAt(normalized),
    parseHealthFilledAt(formFields.health_filled_at),
    todayLocalIso(),
  )
  const sex = normalizeHealthSex(formFields.sex) ?? getHealthSexFromHealth(normalized)

  const now = new Date().toISOString()
  const persist = mergeHealthCardPersistRow(normalized, {
    height_cm: formFields.height_cm ?? null,
    sex,
    health_filled_at: healthFilledAt,
    goal: formFields.goal ?? null,
    diseases: formFields.diseases ?? null,
    contraindications: formFields.contraindications ?? null,
    medications: formFields.medications ?? null,
    notes: formFields.notes ?? null,
    initial_weight_kg: nextInitial,
    current_weight_kg: nextCurrent,
    weight_kg: nextCurrent,
    weight_updated_at: normalized?.weight_updated_at ?? null,
  })

  const row = {
    id: normalized?.id ?? crypto.randomUUID(),
    client_id: clientId,
    ...persist,
    updated_at: now,
  }

  await saveLocalWithSync('health_cards', row, {
    table_name: 'health_cards',
    operation: normalized ? 'update' : 'insert',
    remote_id: normalized ? row.id : null,
  })

  if (nextInitial != null && healthFilledAt) {
    const entries = await listWeightEntriesByClientId(clientId)
    const normalized = entries.map(normalizeWeightEntryRow)
    const keeper = await upsertBaselineWeightEntry(clientId, normalized, {
      date: healthFilledAt,
      weightKg: nextInitial,
    })
    await pruneDuplicateBaselineEntries(clientId, normalized, keeper?.id)
  }

  return row
}

function getHealthSexFromHealth(health) {
  return normalizeHealthSex(health?.sex)
}

async function updateHealthCurrentWeight(clientId, health, weightKg) {
  const normalized = normalizeHealthCardWeights(health)
  const initial = getHealthInitialWeightKg(normalized) ?? weightKg
  const now = new Date().toISOString()
  const weightPatch = applyHealthWeightPatch(normalized, {
    initialKg: initial,
    currentKg: weightKg,
    weightUpdatedAt: now,
  })
  const persist = mergeHealthCardPersistRow(normalized, weightPatch)
  const fullRow = {
    id: normalized?.id ?? crypto.randomUUID(),
    client_id: clientId,
    ...persist,
    updated_at: now,
  }
  await saveLocalWithSync('health_cards', fullRow, {
    table_name: 'health_cards',
    operation: normalized ? 'update' : 'insert',
    remote_id: normalized ? fullRow.id : null,
  })
  return fullRow
}

async function saveWeightEntry({ clientId, date, weightKg, source, trainingId, note, operation = 'insert', remoteId = null, id }) {
  const now = new Date().toISOString()
  const row = {
    id: id ?? crypto.randomUUID(),
    client_id: clientId,
    date,
    weight_kg: weightKg,
    source,
    training_id: trainingId,
    note,
    created_at: now,
  }
  await saveLocalWithSync('client_weight_entries', row, {
    table_name: 'client_weight_entries',
    operation,
    remote_id: remoteId,
  })
  return normalizeWeightEntryRow(row)
}

/**
 * Одна baseline-точка на дату составления карты; правки исходного веса обновляют её, а не плодят строки.
 * @param {string} clientId
 * @param {object[]} entries
 * @param {{ date: string, weightKg: number }} opts
 */
export async function upsertBaselineWeightEntry(clientId, entries, opts) {
  const date = parseHealthFilledAt(opts.date)
  const weightKg = parseWeightKg(opts.weightKg)
  if (!date || weightKg == null) return null

  const existing = findBaselineWeightEntry(entries)
  if (existing?.id) {
    const op = existing.synced === true ? 'update' : 'insert'
    return saveWeightEntry({
      clientId,
      id: existing.id,
      date,
      weightKg,
      source: 'baseline',
      trainingId: null,
      note: null,
      operation: op,
      remoteId: existing.id,
    })
  }

  return saveWeightEntry({
    clientId,
    date,
    weightKg,
    source: 'baseline',
    trainingId: null,
    note: null,
  })
}

/**
 * Удаляет лишние baseline/initial_adjust — остаётся одна точка исходного веса.
 * @param {string} clientId
 * @param {object[]} entries
 * @param {string | null | undefined} keeperId
 */
export async function pruneDuplicateBaselineEntries(clientId, entries, keeperId) {
  const dupes = listBaselineLikeEntries(entries).filter((r) => r.id !== keeperId)
  for (const row of dupes) {
    if (!row?.id) continue
    await deleteLocalWithSync('client_weight_entries', row.id, 'client_weight_entries')
  }
  return dupes.length
}

/**
 * При загрузке истории: одна baseline на дату карты, дубли удаляем.
 * @param {string} clientId
 * @param {object | null | undefined} health
 */
export async function repairBaselineWeightEntries(clientId, health) {
  if (!clientId) return 0
  const initial = getHealthInitialWeightKg(health)
  if (initial == null) return 0

  const rows = (await listWeightEntriesByClientId(clientId)).map(normalizeWeightEntryRow)
  const baselineLike = listBaselineLikeEntries(rows)
  const filledAt = getHealthFilledAt(health) ?? parseHealthFilledAt(baselineLike[0]?.date) ?? todayLocalIso()

  if (baselineLike.length === 1) {
    const only = baselineLike[0]
    const sameDate = parseHealthFilledAt(only.date) === filledAt
    const sameWeight = Math.round(Number(only.weight_kg) * 10) === Math.round(initial * 10)
    if (sameDate && sameWeight && only.source === 'baseline') return 0
  }

  const keeper = await upsertBaselineWeightEntry(clientId, rows, { date: filledAt, weightKg: initial })
  const fresh = (await listWeightEntriesByClientId(clientId)).map(normalizeWeightEntryRow)
  return pruneDuplicateBaselineEntries(clientId, fresh, keeper?.id)
}
