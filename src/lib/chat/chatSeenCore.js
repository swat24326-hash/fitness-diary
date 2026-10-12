/**
 * «Прочитано» — только когда новое сообщение на экране, как в Telegram. Без React.
 * Опрос ленты, пока человек листает историю выше, шлёт seen=0 — сервер отметку не ставит.
 * Дошёл до низа — сразу перечитываем с отметкой.
 */

/** Сервер: ставить ли «прочитано». Старые версии приложения параметр не шлют — ставим, как раньше. */
export function chatSeenFromRequest(raw) {
  return !(raw === false || raw === 0 || raw === '0' || raw === 'false')
}

/** Клиент: параметр запроса ленты. Внизу ленты — ничего не добавляем (запрос как у старых версий). */
export function chatSeenParam(seen) {
  return seen === false ? { seen: 0 } : {}
}

/** Человек дошёл до низа после чтения истории — перечитать ленту, чтобы поставить отметку. */
export function chatSeenNeedsRefresh(wasAtBottom, atBottom) {
  return !wasAtBottom && atBottom
}
