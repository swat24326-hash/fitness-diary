/** Прокрутить ленту к сообщению и коротко подсветить его (цитата, поиск, «назад к ответу»). Работает с DOM. */

const FLASH_MS = 1300

/** @returns {boolean} false — сообщения ещё нет в загруженной ленте */
export function jumpToChatMessage(id) {
  const el = document.querySelector(`[data-msg-id="${CSS.escape(String(id))}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.remove('is-flash')
  void el.offsetWidth
  el.classList.add('is-flash')
  window.setTimeout(() => el.classList.remove('is-flash'), FLASH_MS)
  return true
}
