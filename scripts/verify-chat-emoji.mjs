/**
 * Смайлики переписки (Noto, как в Telegram): каталог по разделам без цвета кожи и грубых жестов,
 * ключ Noto для смайлика (с FE0F и без), разбор текста на текст и смайлики, крупные 1–3 смайлика.
 */
import { CHAT_EMOJI_CATALOG } from '../src/lib/chat/chatEmojiCatalog.js'
import { CHAT_EMOJI_SETS } from '../src/lib/chat/chatEmojiCore.js'
import { notoEmojiKey, notoEmojiLottieUrl, notoEmojiStaticUrl, splitEmojiText } from '../src/lib/chat/chatEmojiNotoCore.js'
import { isEmojiOnly } from '../src/lib/chat/chatFeedCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed++
    console.error(`FAIL: ${msg}`)
  }
}

const all = CHAT_EMOJI_CATALOG.flatMap((g) => g.items)
const ids = CHAT_EMOJI_CATALOG.map((g) => g.id)
ok(JSON.stringify(ids) === JSON.stringify(['smileys', 'nature', 'food', 'activity', 'travel', 'objects', 'symbols', 'flags']), 'разделы как в Telegram, по порядку')
ok(CHAT_EMOJI_SETS === CHAT_EMOJI_CATALOG, 'панель берёт наборы из каталога')
ok(all.length >= 500, `в каталоге ${all.length} смайликов`)
ok(new Set(all).size === all.length, 'без повторов')
ok(!all.some((e) => /[\u{1F3FB}-\u{1F3FF}]/u.test(e)), 'без вариантов цвета кожи')
ok(!all.includes('🖕'), 'без грубых жестов')
for (const e of ['😀', '👍', '💪', '🔥', '🥗', '❤️', '🙏']) ok(all.includes(e), `в каталоге есть ${e}`)

ok(notoEmojiKey('😀') === '1f600', 'ключ Noto: 😀 → 1f600')
ok(notoEmojiKey('❤️') === '2764_fe0f' && notoEmojiKey('❤') === '2764_fe0f', 'ключ Noto: сердце с FE0F и без — один смайлик')
ok(notoEmojiKey('🙂‍↕️') === '1f642_200d_2195_fe0f', 'ключ Noto: составной смайлик (ZWJ)')
ok(notoEmojiKey('🖕') === null && notoEmojiKey('a') === null, 'нет в каталоге — null (символ остаётся текстом)')
ok(
  notoEmojiStaticUrl('1f600') === '/chat-emoji/1f600/emoji.svg' && notoEmojiLottieUrl('1f600') === '/chat-emoji/1f600/lottie.json',
  'адреса со своего origin (/chat-emoji/), не Google CDN',
)

const parts = splitEmojiText('Привет 👋 как дела?💪')
ok(
  JSON.stringify(parts) === JSON.stringify([{ text: 'Привет ' }, { text: '👋', key: '1f44b' }, { text: ' как дела?' }, { text: '💪', key: '1f4aa' }]),
  'текст разбит на текст и смайлики',
)
ok(JSON.stringify(splitEmojiText('без смайликов')) === JSON.stringify([{ text: 'без смайликов' }]), 'текст без смайликов — один кусок')
ok(splitEmojiText('🖕').every((p) => !p.key), 'смайлик вне каталога — текстом')
ok(splitEmojiText('❤️‍🔥')[0]?.key === notoEmojiKey('❤️‍🔥'), 'составное сердце — одним смайликом')
ok(splitEmojiText('').length === 0, 'пустой текст — пусто')

ok(isEmojiOnly('💪') && isEmojiOnly('🔥 🔥 🔥') && !isEmojiOnly('🔥🔥🔥🔥') && !isEmojiOnly('ок 👍'), 'крупно: 1–3 смайлика без текста')

if (failed) {
  console.error(`verify-chat-emoji: ${failed} FAIL`)
  process.exit(1)
}
console.log('verify-chat-emoji: all passed')
