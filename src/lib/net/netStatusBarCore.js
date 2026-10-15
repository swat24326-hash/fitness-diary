/**
 * Плашка связи приложения клиента и телефона тренера, как «Соединение…» в Telegram: данные на экране остаются
 * (кэш экранов), плашка лишь честно говорит, что они могут быть не самые свежие.
 * offline — нет Wi‑Fi / интернета на телефоне; connecting — интернет есть, а сервер ещё не ответил
 * (сеть только что вернулась или запрос к серверу оборвался по таймауту); hidden — всё хорошо.
 */
export const NET_BAR_DELAY_MS = 1500
export const NET_BAR_PROBE_MS = 5000

export const NET_BAR_TEXT_RU = Object.freeze({
  offline: 'Нет сети — показываем сохранённое',
  connecting: 'Соединение…',
})

/** @param {{ browserOnline: boolean, cloudConfirmed: boolean }} p @returns {'offline' | 'connecting' | 'hidden'} */
export function netStatusBarState({ browserOnline, cloudConfirmed }) {
  if (!browserOnline) return 'offline'
  return cloudConfirmed ? 'hidden' : 'connecting'
}

/**
 * Показывать ли: короткий сбой (меньше NET_BAR_DELAY_MS) не мигает плашкой; хорошее — сразу.
 * @param {'offline' | 'connecting' | 'hidden'} state @param {number} since когда состояние началось @param {number} now
 */
export function netStatusBarShown(state, since, now) {
  return state !== 'hidden' && now - since >= NET_BAR_DELAY_MS
}
