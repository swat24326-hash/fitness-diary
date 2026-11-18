/**
 * Копирование нагрузки подхода из предыдущего (кг / повторы / RPE / кардио).
 * Пульс не копируем — у каждого подхода свой (ручной ввод или двойной тап с датчика).
 */

import { emptyTrainingSetRow } from './trainingSetLateralityCore.js'

/** Поля «рецепта» подхода — без пульса. */
export const TRAINING_SET_COPYABLE_KEYS = [
  'reps',
  'weight_kg',
  'tut_sec',
  'load',
  'rpe',
  'reps_l',
  'reps_r',
  'weight_kg_l',
  'weight_kg_r',
  'rpe_l',
  'rpe_r',
]

const HR_PRESERVE_KEYS = ['hr_after', 'hr_after_l', 'hr_after_r']

function trimField(v) {
  return String(v ?? '').trim()
}

/** Есть ли что копировать (не считая пульс). */
export function trainingSetHasCopyableLoad(st) {
  if (!st || typeof st !== 'object') return false
  return TRAINING_SET_COPYABLE_KEYS.some((k) => trimField(st[k]) !== '')
}

/**
 * Подставить нагрузку из prev в target; пульс и прочие поля target сохранить.
 * @param {object|null|undefined} prev
 * @param {object|null|undefined} target
 */
export function copyTrainingSetLoadFromPrevious(prev, target) {
  const base =
    target && typeof target === 'object'
      ? { ...emptyTrainingSetRow(), ...target }
      : emptyTrainingSetRow()
  const src = prev && typeof prev === 'object' ? prev : {}

  for (const k of TRAINING_SET_COPYABLE_KEYS) {
    base[k] = src[k] ?? ''
  }

  for (const k of HR_PRESERVE_KEYS) {
    base[k] = target && typeof target === 'object' ? (target[k] ?? '') : ''
  }

  return base
}
