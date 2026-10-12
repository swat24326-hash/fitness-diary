/**
 * Реакции на сообщения, как в Telegram. Без React и без базы — общее для сервера и экрана.
 * Одна реакция от человека на сообщение: другая заменяет, та же снимает.
 */
import { notoEmojiKey, splitEmojiText } from './chatEmojiNotoCore.js'

/** Полоска над сообщением; остальные смайлики набора — по стрелке «ещё». */
export const CHAT_REACTIONS = ['👍', '❤️', '🔥', '💪', '😂', '🙏']
/** Двойной тап по сообщению. */
export const CHAT_QUICK_REACTION = '👍'
export const CHAT_REACTION_YOU_RU = 'Вы'
export const CHAT_REACTION_BAD_RU = 'Такую реакцию поставить нельзя'
export const CHAT_REACTION_GONE_RU = 'Сообщение не найдено — обновите диалог'
export const CHAT_REACTION_OFFLINE_RU = 'Нет сети — реакция не поставлена'

/** Ровно один смайлик из каталога Noto (его рисуем картинкой у всех одинаково). */
function isCatalogEmoji(emoji) {
  if (emoji.length > 16 || !notoEmojiKey(emoji)) return false
  const parts = splitEmojiText(emoji)
  return parts.length === 1 && parts[0].text === emoji
}

/** emoji пусто / null — снять свою реакцию. @returns {{ ok: true, emoji: string|null } | { ok: false, error: string }} */
export function normalizeChatReaction(raw) {
  if (raw == null || raw === '') return { ok: true, emoji: null }
  const emoji = String(raw)
  return CHAT_REACTIONS.includes(emoji) || isCatalogEmoji(emoji) ? { ok: true, emoji } : { ok: false, error: CHAT_REACTION_BAD_RU }
}

/** Кто поставил: клиент — 'c:<id>', сотрудник — 'u:<id>'. */
export function chatReactorKey(side, id) {
  return `${side === 'client' ? 'c' : 'u'}:${String(id ?? '').trim()}`
}

/** Сторона по ключу: 'c:…' — клиент, иначе сотрудник. */
export function chatReactorSide(reactor) {
  return String(reactor ?? '').startsWith('c:') ? 'client' : 'staff'
}

const order = (emoji) => {
  const i = CHAT_REACTIONS.indexOf(emoji)
  return i < 0 ? CHAT_REACTIONS.length : i
}
const byVotes = (a, b) => b.count - a.count || order(a.emoji) - order(b.emoji)

/**
 * Плашки под сообщением: больше голосов — левее, при равенстве — порядок набора.
 * who — кто поставил («Вы» первым), для подсказки по удержанию плашки.
 * @param {Array<{ reactor: string, emoji: string }>} rows реакции одного сообщения
 * @param {Map<string, string>} [names] reactor → имя
 * @returns {Array<{ emoji: string, count: number, mine: boolean, who: string[] }>}
 */
export function summarizeChatReactions(rows, viewerKey, names) {
  const byEmoji = new Map()
  for (const r of rows ?? []) {
    const cur = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, who: [] }
    cur.count += 1
    if (viewerKey && r.reactor === viewerKey) {
      cur.mine = true
      cur.who.unshift(CHAT_REACTION_YOU_RU)
    } else {
      const name = names?.get(r.reactor)
      if (name) cur.who.push(name)
    }
    byEmoji.set(r.emoji, cur)
  }
  return [...byEmoji.values()].sort(byVotes)
}

/** @returns {Map<string, Array<{ emoji: string, count: number, mine: boolean, who: string[] }>>} id сообщения → плашки */
export function chatReactionsByMessage(rows, viewerKey, names) {
  const grouped = new Map()
  for (const r of rows ?? []) {
    const id = String(r.message_id)
    if (!grouped.has(id)) grouped.set(id, [])
    grouped.get(id).push(r)
  }
  return new Map([...grouped].map(([id, list]) => [id, summarizeChatReactions(list, viewerKey, names)]))
}

/** Моя реакция на сообщении (или null). */
export function myChatReaction(reactions) {
  return (reactions ?? []).find((r) => r.mine)?.emoji ?? null
}

/**
 * Нажали смайлик: что отправить на сервер и как сразу показать (до ответа).
 * @returns {{ emoji: string|null, reactions: Array<{ emoji: string, count: number, mine: boolean, who: string[] }> }}
 */
export function toggleChatReaction(reactions, tapped) {
  const mine = myChatReaction(reactions)
  const next = mine === tapped ? null : tapped
  const out = []
  for (const r of reactions ?? []) {
    const others = (r.who ?? []).filter((w) => !(r.mine && w === CHAT_REACTION_YOU_RU))
    const joined = r.emoji === next
    const count = r.count - (r.mine ? 1 : 0) + (joined ? 1 : 0)
    if (count > 0) out.push({ emoji: r.emoji, count, mine: joined, who: joined ? [CHAT_REACTION_YOU_RU, ...others] : others })
  }
  if (next && !out.some((r) => r.emoji === next)) out.push({ emoji: next, count: 1, mine: true, who: [CHAT_REACTION_YOU_RU] })
  return { emoji: next, reactions: out.sort(byVotes) }
}

/** Ответ сервера / мгновенный показ → новое состояние ленты. */
export function patchChatReactions(messages, messageId, reactions) {
  if (!messages) return messages
  return messages.map((m) => (String(m.id) === String(messageId) ? { ...m, reactions } : m))
}

/** Подсказка по удержанию плашки: «Вы, Анна» / «Анна и ещё 2». */
export function chatReactionWhoRu(reaction) {
  const who = reaction?.who ?? []
  const hidden = Math.max(0, (reaction?.count ?? 0) - who.length)
  if (!who.length) return hidden ? `${hidden}` : ''
  return hidden ? `${who.join(', ')} и ещё ${hidden}` : who.join(', ')
}

/**
 * Значок в списке диалогов: собеседник отреагировал на моё сообщение, а я диалог ещё не открывал.
 * thread — строка chat_threads или staffDmThreadForViewer (там last_reaction_side уже «staff» = я).
 * @param {'client'|'staff'} side кто смотрит
 * @returns {string|null} смайлик
 */
export function chatUnseenReaction(side, thread) {
  if (!thread?.last_reaction_at || !thread.last_reaction_emoji) return null
  const from = thread.last_reaction_side ?? chatReactorSide(thread.last_reaction_by)
  if (from === side) return null
  const seen = side === 'client' ? thread.client_reaction_seen_at : thread.staff_reaction_seen_at
  return !seen || String(seen) < String(thread.last_reaction_at) ? thread.last_reaction_emoji : null
}

/** Реакция на сообщение другого человека — ему значок в списке; на своё — нет (как в Telegram). */
export function chatReactionNotifies(messageAuthorKey, reactor) {
  return Boolean(messageAuthorKey) && String(messageAuthorKey) !== String(reactor)
}
