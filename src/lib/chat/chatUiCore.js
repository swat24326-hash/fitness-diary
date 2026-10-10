/** Подписи списка диалогов и экрана переписки. Без React. */
import { chatKindLabelRu } from './chatAccessCore.js'

/** «Тренер · Анна», «Менеджер по продажам». */
export function chatThreadTitleRu(kind, name) {
  const who = String(name ?? '').trim()
  return who ? `${chatKindLabelRu(kind)} · ${who}` : chatKindLabelRu(kind)
}

/**
 * Строка под заголовком: последнее сообщение («Вы: …» — своё) или приглашение написать.
 * @param {{ last_preview?: string, last_author?: string|null }} t
 * @param {'client'|'staff'} viewerSide
 */
export function chatThreadPreviewRu(t, viewerSide) {
  const text = String(t?.last_preview ?? '').trim()
  if (!text) return viewerSide === 'client' ? 'Напишите, если есть вопрос' : 'Сообщений пока нет'
  return t.last_author === viewerSide ? `Вы: ${text}` : text
}

const CLIENT_EMPTY_RU = Object.freeze({
  trainer: 'Напишите тренеру: вопрос по тренировке, питанию или ссылку на товар. Ответ придёт сюда.',
  sales: 'Абонемент, продление, заморозка, оплата — менеджер клуба ответит здесь.',
  supervisor: 'Предложение или жалоба — управляющий клуба прочитает лично.',
})

export function chatClientEmptyRu(kind) {
  return CLIENT_EMPTY_RU[kind] ?? 'Напишите сообщение — ответ придёт сюда.'
}

/** Инициалы для круглой аватарки: «Тестова Анна» → «ТА», «Ольга» → «О». */
export function chatInitials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

/** Число в кружке на строке диалога: 0 — нет кружка, больше 99 — «99+». */
export function chatUnreadBadge(n) {
  const v = Number(n) || 0
  if (v <= 0) return ''
  return v > 99 ? '99+' : String(v)
}

/** Сотруднику: почему поле ввода скрыто. */
export function chatStaffReadOnlyRu(thread) {
  if (thread?.client?.archived) return 'Клиент в архиве — написать ему нельзя, история сохранена.'
  return 'Эту переписку вы можете только читать.'
}
