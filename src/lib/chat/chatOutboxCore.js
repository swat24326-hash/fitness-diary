/**
 * Сообщения «ждут сети» (часики, как в Telegram), без React и базы. Только текст и стикеры:
 * голосовые, видео и файлы без сети не копим — тяжёлые и с телефона не храним.
 * Повтор идёт с тем же client_msg_id — сервер не создаст дубль, даже если первый раз сохранил, а ответ потерялся.
 */

export const CHAT_OUTBOX_MAX = 20
export const CHAT_OUTBOX_FULL_RU = 'Без сети ждут отправки уже 20 сообщений — дождитесь интернета'
export const CHAT_OUTBOX_PREFIX = 'out:'

/** В очередь — только текст и стикер. */
export function chatOutboxEligible(outgoing) {
  if (!outgoing || outgoing.audio || outgoing.parts || outgoing.video || outgoing.attach) return false
  return Boolean(outgoing.sticker) || typeof outgoing.body === 'string'
}

/**
 * Повторять позже: сети нет или сервер упал. Отказ по существу (403, «слишком много», ошибка текста) — нет:
 * человек должен увидеть причину сразу, а не вечные часики.
 */
export function chatSendRetryable(e) {
  const s = Number(e?.status)
  return !s || s === 408 || s >= 500
}

/**
 * @param {{ client_msg_id: string } & object} payload ровно то, что уйдёт в send
 * @param {object | null} quote цитата (buildChatReplyQuote) — показать над часиками
 */
export function chatOutboxEntry(payload, quote, now = new Date()) {
  return { id: `${CHAT_OUTBOX_PREFIX}${payload.client_msg_id}`, payload, quote: quote ?? null, created_at: now.toISOString() }
}

export function chatOutboxAdd(list, entry) {
  const cur = list ?? []
  if (cur.some((e) => e.id === entry.id)) return cur
  return [...cur, entry]
}

export function chatOutboxDrop(list, id) {
  return (list ?? []).filter((e) => e.id !== id)
}

/**
 * Лента на экране: с сервера + ждущие сети в конце. Сторона и подпись — как у своих сообщений, чтобы пачка не рвалась.
 * @param {object[] | null} messages
 * @param {Array<ReturnType<typeof chatOutboxEntry>>} outbox
 * @param {'client' | 'staff'} side
 */
export function withChatOutbox(messages, outbox, side) {
  if (!messages || !outbox?.length) return messages
  const mine = [...messages].reverse().find((m) => m.mine)
  const views = outbox.map((e) => ({
    id: e.id,
    body: e.payload.body ?? '',
    sticker: e.payload.sticker ?? null,
    voice: null,
    attach: null,
    created_at: e.created_at,
    side: mine?.side ?? side,
    mine: true,
    author_name: mine?.author_name ?? '',
    reply: e.quote,
    reactions: [],
    pending: true,
  }))
  return [...messages, ...views]
}
