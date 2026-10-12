/**
 * «Задание от тренера» и «Питание» у клиента (без React): одна вкладка «От тренера» внизу /me с точкой «Новое»,
 * внутри переключатель /me/task ↔ /me/nutrition; подписи «от 08.10 · Анна».
 */
import { formatPlanMomentRu } from '../clientPlans/clientPlanCore.js'

export const CLIENT_PLAN_TITLES = Object.freeze({ homework: 'Задание', nutrition: 'Питание' })
export const CLIENT_PLAN_ROUTES = Object.freeze({ homework: '/me/task', nutrition: '/me/nutrition' })

/** Вкладка «От тренера» открывает новое: свежий только рацион — сразу питание, иначе задание. */
export function clientPlanTabTarget(plans) {
  return clientPlanFresh(plans, 'nutrition') && !clientPlanFresh(plans, 'homework') ? CLIENT_PLAN_ROUTES.nutrition : CLIENT_PLAN_ROUTES.homework
}

/** «08.10» по часам устройства. */
export function planDayRu(iso, timeZone) {
  return formatPlanMomentRu(iso, timeZone).split(',')[0]
}

export function planFootRu(brief, timeZone) {
  const first = String(brief?.trainer_name ?? '').trim().split(/\s+/)[0]
  return [`от ${planDayRu(brief?.sent_at, timeZone)}`, first].filter(Boolean).join(' · ')
}

/** Клиенту не говорим «домашнее» — задание может быть и на зал; свой заголовок тренера оставляем. */
export function clientHomeworkTitle(title) {
  const t = String(title ?? '').trim()
  return !t || /^домашнее задание$/i.test(t) ? 'Упражнения' : t
}

/** Точка «Новое» на вкладке: последнее присланное этого вида клиент ещё не открывал. */
export function clientPlanFresh(plans, kind) {
  const last = plans?.[kind]
  return Boolean(last?.id) && !last.seen
}

/** Клиент открыл задание — гасим точку в сохранённом ответе /api/client-me, не дожидаясь следующей загрузки. */
export function markClientPlanSeen(plans, id) {
  if (!plans || !id) return plans
  let changed = false
  const next = { ...plans }
  for (const kind of Object.keys(CLIENT_PLAN_TITLES)) {
    if (next[kind]?.id === id && !next[kind].seen) {
      next[kind] = { ...next[kind], seen: true }
      changed = true
    }
  }
  return changed ? next : plans
}
