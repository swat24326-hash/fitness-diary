/**
 * Список клиентов тренера за день: статус vs рацион для чипов фильтра.
 * Чистый АЗ без рациона: есть записи → other (только «Все»), пусто → empty.
 */
import { compareFoodDiaryToPlan } from './foodDiaryVsPlanCore.js'

export const FOOD_DIARY_ROSTER_FILTERS = Object.freeze([
  { id: 'all', label: 'Все' },
  { id: 'ok', label: 'В цели' },
  { id: 'miss', label: 'Мимо' },
  { id: 'empty', label: 'Пусто' },
])

/**
 * @param {{ status?: string, fact_kcal?: number }} vs — из compareFoodDiaryToPlan
 * @returns {'ok'|'miss'|'empty'|'other'}
 */
export function foodDiaryRosterChip(vs) {
  const status = String(vs?.status ?? '')
  const fact = Number(vs?.fact_kcal) || 0
  if (status === 'empty' || fact <= 0) return 'empty'
  if (status === 'ok') return 'ok'
  if (status === 'under' || status === 'over') return 'miss'
  return 'other'
}

/**
 * @param {{ kcal?: number }} totals
 * @param {number|null} planKcal
 */
export function buildFoodDiaryRosterRow({ clientId, name, totals, planKcal }) {
  const vs = compareFoodDiaryToPlan(totals, planKcal)
  return {
    client_id: clientId,
    name: String(name ?? '').trim() || 'Без имени',
    fact_kcal: vs.fact_kcal,
    plan_kcal: vs.plan_kcal,
    status: vs.status,
    chip: foodDiaryRosterChip(vs),
    label_ru: vs.label_ru,
  }
}

/**
 * @param {object[]} rows
 * @param {string} filter — all|ok|miss|empty
 */
export function filterFoodDiaryRosterRows(rows, filter) {
  const f = String(filter || 'all')
  if (f === 'all') return rows ?? []
  return (rows ?? []).filter((r) => r.chip === f)
}
