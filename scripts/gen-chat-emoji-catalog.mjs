/**
 * Каталог смайликов переписки из Noto Animated Emoji (Google, CC BY 4.0): разделы как в Telegram,
 * без вариантов цвета кожи. Пишет src/lib/chat/chatEmojiCatalog.js. Запуск: node scripts/gen-chat-emoji-catalog.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const API = 'https://googlefonts.github.io/noto-emoji-animation/data/api.json'
const OUT = fileURLToPath(new URL('../src/lib/chat/chatEmojiCatalog.js', import.meta.url))

const GROUPS = [
  { id: 'smileys', label: 'Смайлы и люди', from: ['Smileys and emotions', 'People'] },
  { id: 'nature', label: 'Животные и природа', from: ['Animals and nature'] },
  { id: 'food', label: 'Еда и напитки', from: ['Food and drink'] },
  { id: 'activity', label: 'Спорт и праздники', from: ['Activities and events'] },
  { id: 'travel', label: 'Путешествия', from: ['Travel and places'] },
  { id: 'objects', label: 'Предметы', from: ['Objects'] },
  { id: 'symbols', label: 'Символы', from: ['Symbols'] },
  { id: 'flags', label: 'Флаги', from: ['Flags'] },
]
const SKIN_TONE = /(^|_)1f3f[b-f](_|$)/
/** Переписка клуба с клиентами — без грубых жестов. */
const EXCLUDE = new Set(['1f595'])

const res = await fetch(API)
if (!res.ok) throw new Error(`api.json: HTTP ${res.status}`)
const { icons } = await res.json()

const seen = new Set()
const groups = GROUPS.map((g) => ({ id: g.id, label: g.label, items: [] }))
for (const icon of icons) {
  const key = String(icon.codepoint ?? '').toLowerCase()
  if (!key || SKIN_TONE.test(key) || EXCLUDE.has(key) || seen.has(key)) continue
  const group = groups[GROUPS.findIndex((g) => g.from.includes(icon.categories?.[0]))]
  if (!group) continue
  seen.add(key)
  group.items.push(String.fromCodePoint(...key.split('_').map((h) => parseInt(h, 16))))
}

const body = groups
  .filter((g) => g.items.length)
  .map((g) => `  { id: '${g.id}', label: '${g.label}', items: ${JSON.stringify(g.items)} },`)
  .join('\n')
writeFileSync(
  OUT,
  `/** Сгенерировано scripts/gen-chat-emoji-catalog.mjs — не править руками. Noto Animated Emoji (Google, CC BY 4.0). */\n` +
    `export const CHAT_EMOJI_CATALOG = Object.freeze([\n${body}\n])\n`,
)
console.log(`chatEmojiCatalog.js: ${groups.map((g) => `${g.id} ${g.items.length}`).join(', ')}`)
