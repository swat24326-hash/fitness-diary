/** Один подход = левая и правая сторона (гантели, выпады). Не путать с форматом 1/2/3. */

export const EXERCISE_LATERALITY_LR = 'lr'

const SIDE_KEYS = ['reps_l', 'reps_r', 'weight_kg_l', 'weight_kg_r']
const HR_SIDE_KEYS = ['hr_after_l', 'hr_after_r']
const RPE_SIDE_KEYS = ['rpe_l', 'rpe_r']

function trimField(v) {
  return String(v ?? '').trim()
}

export function emptyTrainingSetRow() {
  return {
    reps: '',
    weight_kg: '',
    tut_sec: '',
    load: '',
    rpe: '',
    rpe_l: '',
    rpe_r: '',
    hr_after: '',
    hr_after_l: '',
    hr_after_r: '',
    reps_l: '',
    reps_r: '',
    weight_kg_l: '',
    weight_kg_r: '',
  }
}

export function setHasLateralityFields(st) {
  if (!st || typeof st !== 'object') return false
  return SIDE_KEYS.some((k) => trimField(st[k]) !== '')
}

/** Л/П по сторонам нагрузки или отдельным полям пульса/RPE (для infer, дневника, сохранения). */
export function setHasAnyLateralityFields(st) {
  if (!st || typeof st !== 'object') return false
  if (setHasLateralityFields(st)) return true
  return (
    HR_SIDE_KEYS.some((k) => trimField(st[k]) !== '') ||
    RPE_SIDE_KEYS.some((k) => trimField(st[k]) !== '')
  )
}

export function trainingSetRowHasData(s) {
  if (!s || typeof s !== 'object') return false
  const keys = ['reps', 'weight_kg', 'tut_sec', 'load', 'rpe', 'hr_after', ...HR_SIDE_KEYS, ...RPE_SIDE_KEYS, ...SIDE_KEYS]
  return keys.some((k) => trimField(s[k]) !== '')
}

export function setsHaveLoadData(sets) {
  return (Array.isArray(sets) ? sets : []).some((s) => trainingSetRowHasData(s))
}

export function resultHasLaterality(result) {
  if (!result || typeof result !== 'object') return false
  if (String(result.laterality ?? '').trim().toLowerCase() === EXERCISE_LATERALITY_LR) return true
  return (Array.isArray(result.sets) ? result.sets : []).some((s) => setHasAnyLateralityFields(s))
}

/** Флаг или уже записанные стороны — иначе журнал видит Л/П, а форма нет. */
export function exerciseLateralityIsLr(ex) {
  if (String(ex?.laterality ?? '').trim().toLowerCase() === EXERCISE_LATERALITY_LR) return true
  return resultHasLaterality(ex)
}

function pairFromBilateral(left, right, both) {
  if (trimField(left) || trimField(right)) {
    return { left: left ?? '', right: right ?? '' }
  }
  const b = both ?? ''
  return { left: b, right: b }
}

export function expandSetToLaterality(st) {
  const s = st && typeof st === 'object' ? { ...emptyTrainingSetRow(), ...st } : emptyTrainingSetRow()
  const reps = pairFromBilateral(s.reps_l, s.reps_r, s.reps)
  const weight = pairFromBilateral(s.weight_kg_l, s.weight_kg_r, s.weight_kg)
  const hr = pairFromBilateral(s.hr_after_l, s.hr_after_r, s.hr_after)
  const rpe = pairFromBilateral(s.rpe_l, s.rpe_r, s.rpe)
  return {
    ...s,
    reps_l: reps.left,
    reps_r: reps.right,
    weight_kg_l: weight.left,
    weight_kg_r: weight.right,
    hr_after_l: hr.left,
    hr_after_r: hr.right,
    rpe_l: rpe.left,
    rpe_r: rpe.right,
  }
}

/** Правка Л/П: сначала разложить общий вес/повторы на стороны, иначе вторая сторона «видна», но не сохранится. */
export function patchLateralitySetField(st, key, value) {
  return { ...expandSetToLaterality(st), [key]: value }
}

/** Показ Л/П: пустая сторона не прячет общий вес, пока вторая тоже пуста. */
export function displayLateralityField(st, sideKey, otherSideKey, bothKey) {
  const s = st && typeof st === 'object' ? st : {}
  if (trimField(s[sideKey])) return s[sideKey] ?? ''
  if (trimField(s[otherSideKey])) return ''
  return s[bothKey] ?? ''
}

export function collapseSetFromLaterality(st) {
  const s = st && typeof st === 'object' ? st : {}
  const reps = trimField(s.reps_l) || trimField(s.reps_r) || trimField(s.reps)
  const weight = trimField(s.weight_kg_l) || trimField(s.weight_kg_r) || trimField(s.weight_kg)
  const rpe = trimField(s.rpe_l) || trimField(s.rpe_r) || trimField(s.rpe)
  const hr_after = trimField(s.hr_after_l) || trimField(s.hr_after_r) || trimField(s.hr_after)
  return {
    ...s,
    reps,
    weight_kg: weight,
    rpe,
    hr_after,
    reps_l: '',
    reps_r: '',
    weight_kg_l: '',
    weight_kg_r: '',
    rpe_l: '',
    rpe_r: '',
    hr_after_l: '',
    hr_after_r: '',
  }
}

export function applyExerciseLaterality(ex, enabled) {
  const row = ex && typeof ex === 'object' ? ex : {}
  const sets = Array.isArray(row.sets) ? row.sets : []
  if (enabled) {
    return {
      ...row,
      laterality: EXERCISE_LATERALITY_LR,
      sets: sets.map((s) => expandSetToLaterality(s)),
    }
  }
  return {
    ...row,
    laterality: null,
    sets: sets.map((s) => collapseSetFromLaterality(s)),
  }
}

/** Если прошлый раз был Л/П и сейчас пусто — включить режим, не затирая уже введённое. */
export function maybeEnableLateralityFromLast(ex, last, formatAllows) {
  const row = ex && typeof ex === 'object' ? ex : {}
  if (!formatAllows) return row
  if (exerciseLateralityIsLr(row)) return row
  if (!resultHasLaterality(last)) return row
  if (setsHaveLoadData(row.sets)) return row
  return applyExerciseLaterality(row, true)
}

export function normalizeSetForStorage(st, isLr) {
  const raw = st && typeof st === 'object' ? st : {}
  const s = isLr ? expandSetToLaterality(raw) : collapseSetFromLaterality(raw)
  const base = {
    reps: s.reps ?? '',
    weight_kg: s.weight_kg ?? '',
    tut_sec: s.tut_sec ?? '',
    load: s.load ?? '',
    rpe: s.rpe ?? '',
    hr_after: s.hr_after ?? '',
  }
  const comment = trimField(s.comment)
  if (comment) base.comment = s.comment
  if (!isLr) return base
  return {
    ...base,
    reps: '',
    weight_kg: '',
    hr_after: '',
    rpe: '',
    reps_l: s.reps_l ?? '',
    reps_r: s.reps_r ?? '',
    weight_kg_l: s.weight_kg_l ?? '',
    weight_kg_r: s.weight_kg_r ?? '',
    hr_after_l: s.hr_after_l ?? '',
    hr_after_r: s.hr_after_r ?? '',
    rpe_l: s.rpe_l ?? '',
    rpe_r: s.rpe_r ?? '',
  }
}

/**
 * Стороны для веса/повторов (челлендж, сводка).
 * Л/П — две независимые попытки; обычный подход — одна.
 */
export function iterSetLoadSides(st) {
  const s = st && typeof st === 'object' ? st : {}
  if (setHasLateralityFields(s)) {
    const sides = []
    if (trimField(s.reps_l) || trimField(s.weight_kg_l)) {
      sides.push({ reps: s.reps_l, weight_kg: s.weight_kg_l })
    }
    if (trimField(s.reps_r) || trimField(s.weight_kg_r)) {
      sides.push({ reps: s.reps_r, weight_kg: s.weight_kg_r })
    }
    if (sides.length) return sides
  }
  return [{ reps: s.reps, weight_kg: s.weight_kg }]
}

/** Числа веса или повторов со всех сторон подхода (для графиков статистики). */
export function collectSetLoadNums(sets, key) {
  const nums = []
  for (const st of sets ?? []) {
    for (const side of iterSetLoadSides(st)) {
      const n = Number(String(side?.[key] ?? '').replace(',', '.'))
      if (Number.isFinite(n) && n > 0) nums.push(n)
    }
  }
  return nums
}

function setUsesSideKeys(st, sideKeys) {
  if (setHasLateralityFields(st)) return true
  return sideKeys.some((k) => trimField(st?.[k]) !== '')
}

/** RPE или пульс: стороны Л/П или одно bilateral-поле. */
export function iterSetSideOrBoth(st, sideKeys, bothKey) {
  const s = st && typeof st === 'object' ? st : {}
  if (setUsesSideKeys(s, sideKeys)) {
    const vals = []
    for (const k of sideKeys) {
      if (trimField(s[k])) vals.push(trimField(s[k]))
    }
    if (!vals.length && trimField(s[bothKey])) vals.push(trimField(s[bothKey]))
    return vals
  }
  if (trimField(s[bothKey])) return [trimField(s[bothKey])]
  return []
}

export function collectSetRpeNums(sets) {
  const nums = []
  for (const st of sets ?? []) {
    for (const v of iterSetSideOrBoth(st, RPE_SIDE_KEYS, 'rpe')) {
      const n = Number(String(v).replace(',', '.'))
      if (Number.isFinite(n) && n > 0) nums.push(n)
    }
  }
  return nums
}

export function collectSetHrAfterNums(sets) {
  const nums = []
  for (const st of sets ?? []) {
    for (const v of iterSetSideOrBoth(st, HR_SIDE_KEYS, 'hr_after')) {
      const n = Number(String(v).replace(',', '.'))
      if (Number.isFinite(n) && n > 0) nums.push(n)
    }
  }
  return nums
}

export function iterSetRpeValues(st) {
  return iterSetSideOrBoth(st, RPE_SIDE_KEYS, 'rpe')
}

function sideLine(tag, weightKg, reps, hrAfter, rpeSide) {
  const bits = []
  if (trimField(weightKg)) bits.push(`${trimField(weightKg)} кг`)
  if (trimField(reps)) bits.push(`${trimField(reps)} повт.`)
  if (trimField(hrAfter)) bits.push(`пульс ${trimField(hrAfter)}`)
  if (trimField(rpeSide)) bits.push(`RPE ${trimField(rpeSide)}`)
  if (!bits.length) return ''
  return `${tag} ${bits.join(' ')}`
}

/** Текст Л/П для дневника; null если сторон нет. */
export function formatLateralitySetSummary(st) {
  if (!setHasAnyLateralityFields(st)) return null
  const s = st && typeof st === 'object' ? st : {}
  const legacyHr = !trimField(s.hr_after_r) ? s.hr_after : ''
  const legacyRpe = !trimField(s.rpe_r) ? s.rpe : ''
  const parts = [
    sideLine(
      'Л',
      s.weight_kg_l,
      s.reps_l,
      s.hr_after_l || legacyHr,
      s.rpe_l || legacyRpe,
    ),
    sideLine('П', s.weight_kg_r, s.reps_r, s.hr_after_r, s.rpe_r),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}
