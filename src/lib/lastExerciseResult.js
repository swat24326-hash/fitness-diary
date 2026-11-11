/** Поиск прошлого результата упражнения в тренировках клиента (без React/IDB). */

export function normExerciseNameForMatch(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * @param {object} ex
 * @param {{ catalogExerciseId?: string|null, name?: string }} lookup
 */
export function exerciseMatchesLookup(ex, lookup) {
  if (!ex || !lookup) return false
  const catalogId = String(lookup.catalogExerciseId ?? '').trim()
  if (catalogId && String(ex.catalog_exercise_id ?? '').trim() === catalogId) return true
  const wanted = normExerciseNameForMatch(lookup.name)
  if (!wanted) return false
  return normExerciseNameForMatch(ex.name) === wanted
}

function trainingSortKey(training) {
  const date = String(training?.date ?? '').slice(0, 10)
  const created = String(training?.created_at ?? '')
  return `${date}\t${created}`
}

/**
 * История упражнения по завершённым тренировкам (новее сверху, одно вхождение на тренировку).
 * @param {object[]} trainings
 * @param {{ catalogExerciseId?: string|null, name?: string }} lookup
 * @param {{ excludeTrainingId?: string|null, limit?: number }} [opts]
 * @returns {{ rows: object[], total: number }}
 */
export function listExerciseHistory(trainings, lookup, opts = {}) {
  const excludeId = String(opts.excludeTrainingId ?? '').trim()
  const hasLookup =
    String(lookup?.catalogExerciseId ?? '').trim() || normExerciseNameForMatch(lookup?.name)
  if (!hasLookup) return { rows: [], total: 0 }

  const rawLimit = opts.limit
  const limit =
    rawLimit == null || rawLimit === ''
      ? 40
      : Number.isFinite(Number(rawLimit))
        ? Math.max(0, Math.floor(Number(rawLimit)))
        : 40

  const sorted = [...(trainings ?? [])]
    .filter((t) => t?.status === 'completed')
    .filter((t) => !excludeId || String(t.id ?? '') !== excludeId)
    .sort((a, b) => trainingSortKey(b).localeCompare(trainingSortKey(a)))

  /** @type {object[]} */
  const all = []
  for (const training of sorted) {
    const list = training?.data?.exercises
    if (!Array.isArray(list)) continue
    for (const ex of list) {
      if (!exerciseMatchesLookup(ex, lookup)) continue
      all.push({
        trainingId: String(training.id ?? ''),
        date: String(training.date ?? '').slice(0, 10),
        format: ex.format,
        laterality: ex.laterality ?? null,
        sets: Array.isArray(ex.sets) ? ex.sets : [],
        muscle_focus: String(ex.muscle_focus ?? '').trim(),
      })
      break
    }
  }

  return {
    rows: limit > 0 ? all.slice(0, limit) : [],
    total: all.length,
  }
}

/**
 * @param {object[]} trainings
 * @param {{ catalogExerciseId?: string|null, name?: string }} lookup
 * @param {{ excludeTrainingId?: string|null }} [opts]
 * @returns {{ trainingId: string, date: string, format?: string, sets: object[], muscle_focus: string }|null}
 */
export function findLastExerciseResult(trainings, lookup, opts = {}) {
  const { rows } = listExerciseHistory(trainings, lookup, { ...opts, limit: 1 })
  return rows[0] ?? null
}
