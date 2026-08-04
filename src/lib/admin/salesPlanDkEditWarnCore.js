/** Предупреждение при ручной правке ДК в матрице плана. */

/**
 * Поле формы матрицы: plan_pz_dk_count / plan_tz_dk_avg …
 * @param {unknown} fieldKey
 */
export function isPlanMatrixDkFieldKey(fieldKey) {
  return /^plan_(pz|tz|az)_dk_(count|avg)$/.test(String(fieldKey ?? ''))
}

/** Текст для UI: ДК править можно, списки закрытий не синхронизируются. */
export const PLAN_DK_EDIT_WARN_RU =
  'ДК в плане можно менять, но списки закрытий в Стратегии от этого не обновятся — цифры плана и список могут разойтись.'
