/** Парсинг веса из строки/числа. */
export function parseWeightKg(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/**
 * Актуальный вес для ИМТ, питания, статистики.
 * @param {{ current_weight_kg?: unknown, weight_kg?: unknown } | null | undefined} health
 */
export function getHealthCurrentWeightKg(health) {
  return parseWeightKg(health?.current_weight_kg) ?? parseWeightKg(health?.weight_kg)
}

/**
 * Исходный вес (база прогресса).
 * @param {{ initial_weight_kg?: unknown, weight_kg?: unknown } | null | undefined} health
 */
export function getHealthInitialWeightKg(health) {
  return parseWeightKg(health?.initial_weight_kg) ?? parseWeightKg(health?.weight_kg)
}

/**
 * Нормализация legacy weight_kg → initial/current на клиенте.
 * @param {object | null | undefined} health
 */
export function normalizeHealthCardWeights(health) {
  if (!health || typeof health !== 'object') return health ?? null
  const legacy = parseWeightKg(health.weight_kg)
  const initial = parseWeightKg(health.initial_weight_kg) ?? legacy
  const current = parseWeightKg(health.current_weight_kg) ?? legacy
  return {
    ...health,
    initial_weight_kg: initial,
    current_weight_kg: current,
    weight_kg: current ?? legacy,
  }
}

/** @param {object | null | undefined} health */
export function formatWeightProgressDelta(health) {
  const initial = getHealthInitialWeightKg(health)
  const current = getHealthCurrentWeightKg(health)
  if (initial == null || current == null) return null
  const delta = Math.round((current - initial) * 10) / 10
  if (delta === 0) return { delta: 0, text: 'без изменений от исходного' }
  const sign = delta > 0 ? '+' : ''
  return { delta, text: `${sign}${delta} кг от исходного` }
}

export const WEIGHT_ENTRY_SOURCES = /** @type {const} */ (['manual', 'training', 'baseline', 'initial_adjust'])

/** @param {string} source */
export function weightEntrySourceLabelRu(source) {
  if (source === 'training') return 'С тренировки'
  if (source === 'baseline' || source === 'initial_adjust') return 'Исходный (карта здоровья)'
  return 'Вручную'
}

/** @param {object} row */
export function normalizeWeightEntryRow(row) {
  if (!row || typeof row !== 'object') return row
  const r = { ...row }
  if (r.date != null) r.date = String(r.date).slice(0, 10)
  r.weight_kg = parseWeightKg(r.weight_kg)
  return r
}

/**
 * @param {object[]} entries
 */
export function sortWeightEntriesDesc(entries) {
  return [...(entries ?? [])].sort((a, b) => {
    const d = String(b.date ?? '').localeCompare(String(a.date ?? ''))
    if (d !== 0) return d
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  })
}

export function sortWeightEntriesAsc(entries) {
  return [...(entries ?? [])].sort((a, b) => {
    const d = String(a.date ?? '').localeCompare(String(b.date ?? ''))
    if (d !== 0) return d
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
}

/**
 * Все завершённые тренировки с весом до тренировки (хронологически).
 * @param {object[]} trainings
 * @returns {{ weightKg: number, training: object, date: string, trainingId: string }[]}
 */
export function listTrainingPreWeights(trainings) {
  const rows = []
  for (const training of trainings ?? []) {
    if (String(training?.status ?? '') !== 'completed') continue
    const data = typeof training?.data === 'string' ? safeParseJson(training.data) : training?.data
    const w = parseWeightKg(data?.pre_weight_kg)
    if (w == null) continue
    const date = String(training.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const trainingId = training?.id
    if (!trainingId) continue
    rows.push({ weightKg: w, training, date, trainingId })
  }
  return rows.sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date))
    if (d !== 0) return d
    return String(a.training?.updated_at ?? a.training?.created_at ?? '').localeCompare(
      String(b.training?.updated_at ?? b.training?.created_at ?? ''),
    )
  })
}

/**
 * Последняя завершённая тренировка с весом до тренировки.
 * @param {object[]} trainings
 */
export function pickLatestTrainingPreWeight(trainings) {
  const rows = [...(trainings ?? [])]
    .filter((t) => String(t?.status ?? '') === 'completed')
    .sort((a, b) => {
      const d = String(b.date ?? '').localeCompare(String(a.date ?? ''))
      if (d !== 0) return d
      return String(b.updated_at ?? b.created_at ?? '').localeCompare(String(a.updated_at ?? a.created_at ?? ''))
    })

  for (const training of rows) {
    const data = training?.data
    const payload = typeof data === 'string' ? safeParseJson(data) : data
    const w = parseWeightKg(payload?.pre_weight_kg)
    if (w != null) return { weightKg: w, training, date: String(training.date ?? '').slice(0, 10) }
  }
  return null
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Подсказка веса для поля «Вес» в новой тренировке (строка для input).
 * Только с последней завершённой тренировки — не из карты здоровья:
 * у нового клиента карта уже заполнена, а сегодняшние кг ещё неизвестны.
 * @param {object | null | undefined} _health зарезервировано (раньше брали из карты)
 * @param {object[] | null | undefined} [trainings]
 * @returns {string}
 */
export function suggestTrainingPreWeightInput(_health, trainings) {
  const latest = pickLatestTrainingPreWeight(trainings)
  const kg = latest?.weightKg
  if (kg == null) return ''
  return Number.isInteger(kg) ? String(kg) : String(kg)
}

/**
 * Куда писать вес с тренировки: обновить ту же тренировку, «забрать» ручную запись за день,
 * или создать новую.
 * Исходный вес (baseline / initial_adjust) никогда не claim’им: иначе тот же id становится
 * «с тренировки», а параллельный repair может вернуть строку в baseline — вес с тренировки
 * пропадает (типично, когда дата карты = дата тренировки).
 * @param {object[]} entries
 * @param {{ trainingId: string, date: string }} pick
 * @returns {{ kind: 'update' | 'claim' | 'insert', row: object | null }}
 */
export function findWeightEntryForTrainingUpsert(entries, pick) {
  const list = (entries ?? []).map(normalizeWeightEntryRow)
  const trainingId = pick?.trainingId != null ? String(pick.trainingId) : ''
  const day = String(pick?.date ?? '').slice(0, 10)

  if (trainingId) {
    const byTraining = [...list]
      .filter((r) => r?.source === 'training' && String(r.training_id ?? '') === trainingId)
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
    if (byTraining) return { kind: 'update', row: byTraining }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const sameDayManual = [...list]
      .filter((r) => String(r?.date ?? '').slice(0, 10) === day && r?.source === 'manual')
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
    if (sameDayManual) return { kind: 'claim', row: sameDayManual }
  }

  return { kind: 'insert', row: null }
}

/**
 * @param {number | null | undefined} prevInitial
 * @param {number | null | undefined} nextInitial
 */
export function didInitialWeightChange(prevInitial, nextInitial) {
  if (prevInitial == null && nextInitial == null) return false
  if (prevInitial == null || nextInitial == null) return prevInitial !== nextInitial
  return Math.round(prevInitial * 10) !== Math.round(nextInitial * 10)
}

/**
 * Поля health_cards с зеркалом weight_kg для обратной совместимости.
 * @param {object | null | undefined} health
 * @param {{ initialKg?: number | null, currentKg?: number | null, weightUpdatedAt?: string | null }} patch
 */
export function applyHealthWeightPatch(health, patch) {
  const initial = patch.initialKg !== undefined ? patch.initialKg : getHealthInitialWeightKg(health)
  const current = patch.currentKg !== undefined ? patch.currentKg : getHealthCurrentWeightKg(health)
  const weightUpdatedAt =
    patch.weightUpdatedAt !== undefined ? patch.weightUpdatedAt : health?.weight_updated_at ?? null
  return {
    ...(health ?? {}),
    initial_weight_kg: initial,
    current_weight_kg: current,
    weight_kg: current,
    weight_updated_at: weightUpdatedAt,
  }
}
