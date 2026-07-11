import { todayLocalIso } from './dateRu.js'
import { saveLocalWithSync } from './syncService.js'
import { listWeightEntriesByClientId } from './localDbClubQuery.js'
import {
  applyHealthWeightPatch,
  didInitialWeightChange,
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
 */
export async function listWeightEntries(clientId) {
  const rows = await listWeightEntriesByClientId(clientId)
  return rows.map(normalizeWeightEntryRow)
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
 * Сохранение медкарты: исходный вес из формы, текущий не трогаем.
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

  const now = new Date().toISOString()
  const row = {
    id: normalized?.id ?? crypto.randomUUID(),
    client_id: clientId,
    height_cm: formFields.height_cm ?? null,
    goal: formFields.goal ?? null,
    diseases: formFields.diseases ?? null,
    contraindications: formFields.contraindications ?? null,
    medications: formFields.medications ?? null,
    notes: formFields.notes ?? null,
    nutrition_survey: normalized?.nutrition_survey ?? null,
    nutrition_plan: normalized?.nutrition_plan ?? null,
    nutrition_plan_generated_at: normalized?.nutrition_plan_generated_at ?? null,
    initial_weight_kg: nextInitial,
    current_weight_kg: nextCurrent,
    weight_kg: nextCurrent,
    weight_updated_at: normalized?.weight_updated_at ?? null,
    updated_at: now,
  }

  await saveLocalWithSync('health_cards', row, {
    table_name: 'health_cards',
    operation: normalized ? 'update' : 'insert',
    remote_id: normalized ? row.id : null,
  })

  if (didInitialWeightChange(prevInitial, nextInitial) && nextInitial != null) {
    await saveWeightEntry({
      clientId,
      date: todayLocalIso(),
      weightKg: nextInitial,
      source: 'initial_adjust',
      trainingId: null,
      note: 'Корректировка исходного веса',
    })
  }

  return row
}

async function updateHealthCurrentWeight(clientId, health, weightKg) {
  const normalized = normalizeHealthCardWeights(health)
  const initial = getHealthInitialWeightKg(normalized) ?? weightKg
  const now = new Date().toISOString()
  const row = applyHealthWeightPatch(normalized, {
    initialKg: initial,
    currentKg: weightKg,
    weightUpdatedAt: now,
  })
  const fullRow = {
    id: normalized?.id ?? crypto.randomUUID(),
    client_id: clientId,
    height_cm: normalized?.height_cm ?? null,
    goal: normalized?.goal ?? null,
    diseases: normalized?.diseases ?? null,
    contraindications: normalized?.contraindications ?? null,
    medications: normalized?.medications ?? null,
    notes: normalized?.notes ?? null,
    nutrition_survey: normalized?.nutrition_survey ?? null,
    nutrition_plan: normalized?.nutrition_plan ?? null,
    nutrition_plan_generated_at: normalized?.nutrition_plan_generated_at ?? null,
    ...row,
    updated_at: now,
  }
  await saveLocalWithSync('health_cards', fullRow, {
    table_name: 'health_cards',
    operation: normalized ? 'update' : 'insert',
    remote_id: normalized ? fullRow.id : null,
  })
  return fullRow
}

async function saveWeightEntry({ clientId, date, weightKg, source, trainingId, note }) {
  const now = new Date().toISOString()
  const row = {
    id: crypto.randomUUID(),
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
    operation: 'insert',
    remote_id: null,
  })
  return normalizeWeightEntryRow(row)
}
