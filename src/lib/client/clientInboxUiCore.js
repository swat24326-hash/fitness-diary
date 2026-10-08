/**
 * Подписи «Входящих» на телефоне клиента и готовность формы опроса. Без React.
 */
import { pointsWord } from './clientMeUiCore.js'

/** Строка списка: «Опрос · +50 баллов», «Объявление», «Опрос закрыт». */
export function inboxItemMetaRu(item) {
  if (item?.kind !== 'survey') return 'Объявление'
  if (item.status === 'answered') return 'Опрос пройден'
  if (!item.open) return 'Опрос закрыт'
  const pts = Number(item.reward_points) || 0
  return pts > 0 ? `Опрос · +${pts} ${pointsWord(pts)}` : 'Опрос'
}

/** Подпись на конверте для экранного диктора. */
export function inboxButtonLabelRu(count) {
  const n = Number(count) || 0
  return n > 0 ? `Входящие: новых ${n}` : 'Входящие'
}

export function inboxBadgeText(count) {
  const n = Number(count) || 0
  if (n <= 0) return ''
  return n > 9 ? '9+' : String(n)
}

function answered(q, v) {
  if (q.type === 'multi') return Array.isArray(v) && v.length > 0
  if (q.type === 'text') return String(v ?? '').trim().length > 0
  return v != null
}

/** Номер первого обязательного вопроса без ответа (1…) или 0 — можно отправлять. */
export function firstMissingInboxAnswer(questions, answers) {
  const list = questions ?? []
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i]
    if (q.required !== false && !answered(q, answers?.[q.id])) return i + 1
  }
  return 0
}

/** Переключить вариант в «несколько вариантов» — индексы по порядку. */
export function toggleInboxMultiOption(current, index) {
  const set = new Set(Array.isArray(current) ? current : [])
  if (set.has(index)) set.delete(index)
  else set.add(index)
  return [...set].sort((a, b) => a - b)
}

export function inboxThanksRu(item) {
  const pts = Number(item?.reward_points) || 0
  return pts > 0 ? `Спасибо! +${pts} ${pointsWord(pts)} уже на вашем счёте — обменяйте их на стойке клуба.` : 'Спасибо, ответ отправлен!'
}

/** Плашка баланса во «Входящих»; 0 — плашки нет. */
export function inboxPointsLineRu(points) {
  const n = Number(points) || 0
  if (n <= 0) return ''
  return `${n} ${pointsWord(n)} за опросы · обменять можно на стойке клуба`
}
