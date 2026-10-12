/**
 * Переписка: что в тексте кликабельно — сайты с https:// и без, почта, российские телефоны.
 * node scripts/verify-chat-text-links.mjs
 */
import { chatTextParts } from '../src/lib/chat/chatTextLinksCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

const links = (s) => chatTextParts(s).filter((p) => p.href).map((p) => [p.kind, p.text, p.href])
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const joined = (s) => chatTextParts(s).map((p) => p.text).join('')

const wb = chatTextParts('Смотрите https://www.wildberries.ru/catalog/123/detail.aspx, норм?')
ok(wb.length === 3 && wb[1].href === 'https://www.wildberries.ru/catalog/123/detail.aspx' && wb[2].text === ', норм?', 'https-ссылка, запятая после — не часть ссылки')
ok(same(links('wildberries.ru/catalog/1 , подойдёт?'), [['url', 'wildberries.ru/catalog/1', 'https://wildberries.ru/catalog/1']]), 'сайт без https:// — кликабелен, открывается по https')
ok(same(links('глянь www.ozon.ru/t/abc.'), [['url', 'www.ozon.ru/t/abc', 'https://www.ozon.ru/t/abc']]), 'www. без https://, точка в конце — не часть ссылки')
ok(same(links('Ozon.ru'), [['url', 'Ozon.ru', 'https://Ozon.ru']]), 'домен с большой буквы')
ok(same(links('госуслуги.рф'), [['url', 'госуслуги.рф', 'https://госуслуги.рф']]), 'кириллический домен .рф')
ok(same(links('(https://example.com/a?b=1&c=2).'), [['url', 'https://example.com/a?b=1&c=2', 'https://example.com/a?b=1&c=2']]), 'ссылка в скобках')
ok(links('т.е. завтра в 10.30, файл plan.pdf и v1.2').length === 0, 'сокращения, время и имя файла — не ссылки')
ok(links('javascript:alert(1)').length === 0, 'javascript: — не ссылка')
ok(same(links('почта a.petrova@mail.ru!'), [['email', 'a.petrova@mail.ru', 'mailto:a.petrova@mail.ru']]), 'почта — mailto, домен почты не отдельная ссылка')
ok(same(links('Телефон 89991234567'), [['tel', '89991234567', 'tel:+79991234567']]), 'телефон с 8 — tel:+7')
ok(same(links('звоните +7 (999) 123-45-67 после 18'), [['tel', '+7 (999) 123-45-67', 'tel:+79991234567']]), 'телефон со скобками и дефисами')
ok(links('карта 1234567890123456, код 899912345678').length === 0, 'длинные числа — не телефоны')
ok(links('рост 180, вес 8 999 кг').length === 0, 'короткие числа — не телефон')
ok(
  same(links('https://vk.com/x и 8 999 123 45 67'), [['url', 'https://vk.com/x', 'https://vk.com/x'], ['tel', '8 999 123 45 67', 'tel:+79991234567']]),
  'ссылка и телефон в одном сообщении',
)
const mixed = 'Привет! wb.ru/x, a@b.ru и 89991234567.'
ok(joined(mixed) === mixed, 'текст после разбора склеивается обратно без потерь')
ok(chatTextParts('без ссылок').length === 1 && !chatTextParts('без ссылок')[0].href, 'текст без ссылок — один кусок')

if (failed) {
  console.error(`verify-chat-text-links: провалов ${failed}`)
  process.exit(1)
}
console.log('verify-chat-text-links: всё ок')
