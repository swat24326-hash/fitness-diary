/**
 * Цель клиента: одна из стандартных + уточнение тренера.
 * Хранится текстом в `health_cards.goal` как «Снижение веса — минус 10 кг», чтобы старые экраны и поиск по тексту работали.
 * `homework` — цель генератора авто-ДЗ (`HOMEWORK_GOAL_FORMULAS`).
 */
export const HEALTH_GOALS = [
  { id: 'fat_loss', label: 'Снижение веса', homework: 'fat_loss' },
  { id: 'muscle', label: 'Набор мышечной массы', homework: 'tone' },
  { id: 'recomp', label: 'Рекомпозиция тела', homework: 'tone' },
  { id: 'tone', label: 'Тонус и рельеф', homework: 'tone' },
  { id: 'back', label: 'Здоровая спина', homework: 'posture' },
  { id: 'mobility', label: 'Гибкость и подвижность', homework: 'mobility' },
  { id: 'endurance', label: 'Выносливость', homework: 'endurance' },
  { id: 'general', label: 'Общая физическая форма', homework: 'general' },
  { id: 'rehab', label: 'Восстановление после травмы', homework: 'mobility' },
]

const SEPARATOR = /^\s*[—–\-:.,]?\s*/

/** Текст цели → `{ id, detail }`; старый свободный текст — `id: null`, весь текст в `detail`. Пробел в конце не срезаем — тренер ещё печатает. */
export function parseHealthGoal(text) {
  const raw = String(text ?? '').trimStart()
  const lower = raw.toLowerCase()
  const goal = HEALTH_GOALS.find((g) => {
    if (!lower.startsWith(g.label.toLowerCase())) return false
    const rest = raw.slice(g.label.length)
    return !rest.trim() || /^\s*[—–\-:.,]/.test(rest)
  })
  if (!goal) return { id: null, detail: raw }
  return { id: goal.id, detail: raw.slice(goal.label.length).replace(SEPARATOR, '') }
}

/** `{ id, detail }` → текст для `health_cards.goal` (пусто → null). */
export function composeHealthGoal(id, detail) {
  const label = HEALTH_GOALS.find((g) => g.id === id)?.label ?? ''
  const extra = String(detail ?? '').trimStart()
  const text = label && extra.trim() ? `${label} — ${extra}` : label || extra
  return text.trim() ? text : null
}

/** Цель авто-ДЗ по выбранной цели клиента, иначе null. */
export function homeworkGoalFromHealthGoal(text) {
  const { id } = parseHealthGoal(text)
  return HEALTH_GOALS.find((g) => g.id === id)?.homework ?? null
}
