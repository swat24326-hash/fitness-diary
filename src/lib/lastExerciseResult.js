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
 * @param {object[]} trainings
 * @param {{ catalogExerciseId?: string|null, name?: string }} lookup
 * @param {{ excludeTrainingId?: string|null }} [opts]
 * @returns {{ trainingId: string, date: string, format?: string, sets: object[], muscle_focus: string }|null}
 */
export function findLastExerciseResult(trainings, lookup, opts = {}) {
  const excludeId = String(opts.excludeTrainingId ?? '').trim()
  const hasLookup =
    String(lookup?.catalogExerciseId ?? '').trim() || normExerciseNameForMatch(lookup?.name)
  if (!hasLookup) return null

  const sorted = [...(trainings ?? [])]
    .filter((t) => t?.status === 'completed')
    .filter((t) => !excludeId || String(t.id ?? '') !== excludeId)
    .sort((a, b) => trainingSortKey(b).localeCompare(trainingSortKey(a)))

  for (const training of sorted) {
    const list = training?.data?.exercises
    if (!Array.isArray(list)) continue
    for (const ex of list) {
      if (!exerciseMatchesLookup(ex, lookup)) continue
      return {
        trainingId: String(training.id ?? ''),
        date: String(training.date ?? '').slice(0, 10),
        format: ex.format,
        sets: Array.isArray(ex.sets) ? ex.sets : [],
        muscle_focus: String(ex.muscle_focus ?? '').trim(),
      }
    }
  }
  return null
}
