/**
 * Поиск по переписке: запрос (короткий, `*`, пробелы), шаблон для базы (`%` `_` `\`, е/ё),
 * совпадение без регистра и ё, подсветка, кусок текста вокруг найденного, шаги ↑/↓, кто написал.
 * node scripts/verify-chat-search.mjs
 */
import {
  CHAT_SEARCH_MAX,
  CHAT_SEARCH_SHORT_RU,
  buildChatSearchHit,
  chatSearchPattern,
  chatSearchSnippet,
  chatTextMatches,
  nextChatSearchIndex,
  normalizeChatSearchQuery,
  splitChatSearchMatches,
} from '../src/lib/chat/chatSearchCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failed += 1
  }
}

console.log('Запрос')
ok(normalizeChatSearchQuery('  резинка  ').q === 'резинка', 'пробелы по краям срезаны')
ok(normalizeChatSearchQuery('резинка   для\nног').q === 'резинка для ног', 'пробелы внутри схлопнуты')
ok(normalizeChatSearchQuery('р').error === CHAT_SEARCH_SHORT_RU, 'одна буква — просим ещё')
ok(!normalizeChatSearchQuery('**').ok, 'одни звёздочки — не поиск (PostgREST превратил бы * в %)')
ok(normalizeChatSearchQuery('рез*инка').q === 'рез инка', '* внутри — пробел, не шаблон')
ok(normalizeChatSearchQuery('а'.repeat(500)).q.length === CHAT_SEARCH_MAX, 'длинный запрос обрезан')
ok(!normalizeChatSearchQuery(null).ok, 'пустой запрос — ошибка, не падение')

console.log('Шаблон для базы')
ok(chatSearchPattern('100%') === '%100\\%%', '% из запроса — обычный символ')
ok(chatSearchPattern('a_b') === '%a\\_b%', '_ из запроса — обычный символ')
ok(chatSearchPattern('a\\b') === '%a\\\\b%', '\\ из запроса экранирован')
ok(chatSearchPattern('ещё') === '%_щ_%', 'е и ё — любая буква, точнее отсекает chatTextMatches')

console.log('Совпадение')
ok(chatTextMatches('Купи РЕЗИНКУ среднюю', 'резинк'), 'без учёта регистра')
ok(chatTextMatches('ещё подход', 'еще'), 'ё в тексте = е в запросе')
ok(chatTextMatches('еще подход', 'ещё'), 'е в тексте = ё в запросе')
ok(!chatTextMatches('ащи подход', 'еще'), 'шаблон шире, но лишнее отсекается')
ok(!chatTextMatches(null, 'резинка'), 'стикер без текста — не совпадение')

console.log('Подсветка')
const parts = splitChatSearchMatches('Резинка и ещё резинка', 'резинка')
ok(parts.filter((p) => p.hit).length === 2, 'оба совпадения подсвечены')
ok(parts.map((p) => p.text).join('') === 'Резинка и ещё резинка', 'текст собирается обратно без потерь')
ok(parts[0].hit && parts[0].text === 'Резинка', 'регистр в тексте сохранён')
ok(splitChatSearchMatches('ещё', 'еще')[0].hit, 'подсветка тоже с ё = е')
ok(splitChatSearchMatches('текст', 'т').length === 1 && !splitChatSearchMatches('текст', 'т')[0].hit, 'короткий запрос — без подсветки')

console.log('Кусок текста')
const long = `${'а '.repeat(80)}купил резинку среднюю${' б'.repeat(80)}`
const snip = chatSearchSnippet(long, 'резинку', 60)
ok(snip.match === 'резинку', 'совпадение — в середине куска')
ok(snip.before.startsWith('…') && snip.after.endsWith('…'), 'обрезано с двух сторон — многоточия')
ok(snip.before.length + snip.match.length + snip.after.length <= 62, 'кусок не длиннее лимита (+ многоточия)')
const short = chatSearchSnippet('Резинка  для\nног', 'резинка')
ok(short.before === '' && short.match === 'Резинка' && short.after === ' для ног', 'короткий текст целиком, переносы — пробелы')
ok(chatSearchSnippet('совсем другое', 'резинка').match === '', 'нет совпадения — текст без подсветки')

console.log('Шаги ↑/↓ (новые сверху)')
ok(nextChatSearchIndex(0, 3, true) === 1, '↑ — к более старому')
ok(nextChatSearchIndex(2, 3, true) === null, 'старше последнего — некуда')
ok(nextChatSearchIndex(1, 3, false) === 0, '↓ — к более новому')
ok(nextChatSearchIndex(0, 3, false) === null, 'новее первого — некуда')
ok(nextChatSearchIndex(0, 0, true) === null, 'ничего не нашлось — шагать некуда')

console.log('Найденное для экрана')
const mine = buildChatSearchHit({ id: 7, created_at: '2026-09-01', mine: true, body: 'взял резинку' }, 'резинку')
ok(mine.id === '7' && mine.who === 'Вы', 'своё — «Вы», id строкой')
const peer = buildChatSearchHit({ id: 'x', mine: false, author_name: '', body: 'резинка' }, 'резинка', 'Анна')
ok(peer.who === 'Анна', 'без имени автора — имя собеседника')
ok(peer.snippet.match === 'резинка', 'кусок текста с совпадением')

if (failed) {
  console.error(`\nverify-chat-search: ${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-chat-search: ok')
