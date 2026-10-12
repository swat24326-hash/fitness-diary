/**
 * «Часто используемые» смайлики и стикеры: считаем при отправке, вес тает со временем, новичку — набор для зала.
 * node scripts/verify-chat-emoji-frequent.mjs
 */
import {
  CHAT_FREQUENT_DEFAULT,
  CHAT_FREQUENT_MAX,
  emojisInText,
  emptyEmojiUsage,
  frequentEmojis,
  orderStickersByUse,
  parseEmojiUsage,
  recordEmojiUsage,
} from '../src/lib/chat/chatEmojiFrequentCore.js'
import { notoEmojiKey } from '../src/lib/chat/chatEmojiNotoCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 13, 12)

ok(CHAT_FREQUENT_DEFAULT.length === CHAT_FREQUENT_MAX, 'набор новичка заполняет вкладку целиком')
ok(CHAT_FREQUENT_DEFAULT.every((e) => notoEmojiKey(e)), 'набор новичка — все из каталога Noto (картинкой, с анимацией)')
ok(new Set(CHAT_FREQUENT_DEFAULT).size === CHAT_FREQUENT_DEFAULT.length, 'набор новичка без повторов')

const fresh = frequentEmojis(emptyEmojiUsage(), NOW)
ok(fresh.join() === CHAT_FREQUENT_DEFAULT.join(), 'новичок: вкладка есть сразу — набор для зала')

ok(emojisInText('Огонь 🔥🔥 и 💪, спасибо 🙏').join() === '🔥,💪,🙏', 'смайлики из текста — каждый один раз на сообщение')
ok(emojisInText('без смайликов').length === 0, 'текст без смайликов — ничего')
ok(emojisInText('сердце ❤️').join() === '❤️', 'смайлик с вариантом (❤️) распознаётся')

let u = emptyEmojiUsage()
u = recordEmojiUsage(u, 'привет 🐸', NOW)
ok(frequentEmojis(u, NOW)[0] === '🐸', 'свой смайлик — первым, раньше набора')
ok(frequentEmojis(u, NOW).length === CHAT_FREQUENT_MAX && frequentEmojis(u, NOW).includes('💪'), 'остаток добит набором для зала')

u = emptyEmojiUsage()
for (let i = 0; i < 5; i++) u = recordEmojiUsage(u, '👍', NOW - 3 * DAY + i)
u = recordEmojiUsage(u, '🦄', NOW)
ok(frequentEmojis(u, NOW).indexOf('👍') < frequentEmojis(u, NOW).indexOf('🦄'), 'частый не вытесняется одним случайным')

u = emptyEmojiUsage()
for (let i = 0; i < 3; i++) u = recordEmojiUsage(u, '🍕', NOW - 200 * DAY)
u = recordEmojiUsage(u, '🌞', NOW)
const decayed = frequentEmojis(u, NOW)
ok(decayed.includes('🍕') && decayed.indexOf('🌞') < decayed.indexOf('🍕'), 'давнее использование тает: свежий выше полугодового')

const same = recordEmojiUsage(emptyEmojiUsage(), 'только текст', NOW)
ok(!Object.keys(same.emoji).length && !Object.keys(same.sticker).length, 'текст без смайликов — не записываем')

let s = emptyEmojiUsage()
s = recordEmojiUsage(s, { sticker: 'great' }, NOW)
s = recordEmojiUsage(s, { sticker: 'great' }, NOW)
s = recordEmojiUsage(s, { sticker: 'late' }, NOW)
const stickers = [{ id: 'late' }, { id: 'skip' }, { id: 'great' }, { id: 'water' }]
ok(orderStickersByUse(stickers, s, NOW).map((x) => x.id).join() === 'great,late,skip,water', 'стикеры: частые первыми, остальные в прежнем порядке')
ok(!Object.keys(s.emoji).length, 'стикер не считается смайликом')

const migrated = parseEmojiUsage(null, ['😎', '🍕'], NOW)
ok(frequentEmojis(migrated, NOW).slice(0, 2).join() === '😎,🍕', 'прежние «Недавние» переехали, порядок сохранён')
ok(Object.keys(parseEmojiUsage('мусор', 'тоже', NOW).emoji).length === 0, 'битое хранилище — пусто, без падения')
const kept = parseEmojiUsage({ emoji: { '🐸': { n: 2, t: NOW } }, sticker: {} }, ['😎'], NOW)
ok(Object.keys(kept.emoji).join() === '🐸', 'новое хранилище есть — старые «Недавние» не подмешиваем')

let many = emptyEmojiUsage()
for (let i = 0; i < 260; i++) many = recordEmojiUsage(many, { sticker: `s${i}` }, NOW + i)
ok(Object.keys(many.sticker).length === 200, 'хранилище не растёт бесконечно (200 записей)')

if (failed) {
  console.error(`verify-chat-emoji-frequent: провалов ${failed}`)
  process.exit(1)
}
console.log('verify-chat-emoji-frequent: всё ок')
