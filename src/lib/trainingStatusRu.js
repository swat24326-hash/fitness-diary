/** Отображение статуса тренировки в UI (значения в БД остаются draft / completed). */

const LABELS = {
  draft: 'Черновик',
  completed: 'Завершена',
}

export function formatTrainingStatusRu(status) {
  if (status == null || status === '') return '—'
  const key = String(status).trim()
  return LABELS[key] ?? key
}
