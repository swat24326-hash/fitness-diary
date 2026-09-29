/**
 * Состояние блока «Активные челленджи» на главной тренера.
 * Ошибка загрузки ≠ «челленджей нет»: last-good список не стираем,
 * без списка показываем ошибку, а не плейсхолдер «Скоро начнётся сражение».
 */

export const INITIAL_CHALLENGES_VIEW = { phase: 'loading', items: [] }

export function challengesViewLoading(prev) {
  return { phase: 'loading', items: prev?.items ?? [] }
}

export function challengesViewReady(items) {
  return { phase: 'ready', items: Array.isArray(items) ? items : [] }
}

export function challengesViewOnError(prev) {
  const items = prev?.items ?? []
  return items.length ? { phase: 'ready', items } : { phase: 'error', items: [] }
}
