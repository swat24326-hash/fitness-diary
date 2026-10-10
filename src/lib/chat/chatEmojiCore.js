/** Смайлики для поля ввода: наборы, вставка в позицию курсора, «недавние». Без React. */

export const CHAT_RECENT_MAX = 24

export const CHAT_EMOJI_SETS = Object.freeze([
  {
    id: 'smiles',
    label: 'Эмоции',
    items: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😜', '🤪', '😎', '🤗', '🤔', '🤨', '😐', '😏', '😌', '😴', '🥱', '😮‍💨', '😬', '🙄', '😢', '😭', '😤', '😡', '🥺', '😳', '😱', '🤯', '🥳', '🤒', '🤕'],
  },
  {
    id: 'gestures',
    label: 'Жесты',
    items: ['👍', '👎', '👌', '🤌', '✌️', '🤞', '🤟', '🤙', '👋', '🙌', '👏', '🙏', '🤝', '💪', '✊', '👊', '🫶', '☝️', '👉', '👀', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❤️‍🔥', '💯', '✅', '❌', '❗', '❓', '⭐', '✨', '🎉'],
  },
  {
    id: 'sport',
    label: 'Спорт',
    items: ['🏋️', '🏋️‍♀️', '🤸', '🤸‍♀️', '🧘', '🧘‍♀️', '🏃', '🏃‍♀️', '🚴', '🏊', '🥊', '⚽', '🏀', '🎾', '🏐', '⛹️', '🏆', '🥇', '🥈', '🥉', '🎯', '⏱️', '📈', '📉', '🔥', '⚡', '💦', '🦵', '🫀', '🧠', '🛌', '📅'],
  },
  {
    id: 'food',
    label: 'Питание',
    items: ['🥗', '🥦', '🥕', '🍎', '🍌', '🍓', '🫐', '🥑', '🍳', '🥚', '🍗', '🥩', '🐟', '🍚', '🥣', '🥛', '🧀', '🥜', '🍫', '🍰', '🍕', '🍔', '☕', '🍵', '💧', '🥤', '💊', '⚖️'],
  },
])

/**
 * Вставить смайлик вместо выделения (или в позицию курсора).
 * @returns {{ text: string, caret: number }}
 */
export function insertEmoji(text, start, end, emoji) {
  const src = String(text ?? '')
  const a = Number.isInteger(start) ? Math.max(0, Math.min(start, src.length)) : src.length
  const b = Number.isInteger(end) ? Math.max(a, Math.min(end, src.length)) : a
  return { text: src.slice(0, a) + emoji + src.slice(b), caret: a + emoji.length }
}

/** Недавние: новый — первым, без повторов, не больше CHAT_RECENT_MAX. */
export function pushRecentEmoji(recent, emoji) {
  return [emoji, ...(Array.isArray(recent) ? recent : []).filter((e) => e !== emoji)].slice(0, CHAT_RECENT_MAX)
}
