/**
 * Переписка: «прочитано» только когда новое на экране; экран ошибки — повтор или «К диалогам».
 * node scripts/verify-chat-seen.mjs
 */
import { chatSeenFromRequest, chatSeenNeedsRefresh, chatSeenParam } from '../src/lib/chat/chatSeenCore.js'
import { chatErrorRetryable } from '../src/lib/chat/chatUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

ok(chatSeenFromRequest(undefined) && chatSeenFromRequest(null) && chatSeenFromRequest(''), 'старая версия без параметра — прочитано ставим, как раньше')
ok(chatSeenFromRequest('1') && chatSeenFromRequest(true), 'seen=1 — ставим')
ok(!chatSeenFromRequest('0') && !chatSeenFromRequest(0) && !chatSeenFromRequest(false) && !chatSeenFromRequest('false'), 'seen=0 (GET) / 0 / false (POST) — не ставим')

ok(JSON.stringify(chatSeenParam(false)) === '{"seen":0}', 'читает историю — запрос с seen=0')
ok(JSON.stringify(chatSeenParam(true)) === '{}' && JSON.stringify(chatSeenParam(undefined)) === '{}', 'внизу ленты — запрос без параметра')

ok(chatSeenNeedsRefresh(false, true), 'дошёл до низа после истории — перечитать с отметкой')
ok(!chatSeenNeedsRefresh(true, true) && !chatSeenNeedsRefresh(true, false) && !chatSeenNeedsRefresh(false, false), 'иначе лишних запросов нет')

ok(chatErrorRetryable(undefined) && chatErrorRetryable(500) && chatErrorRetryable(503) && chatErrorRetryable(429), 'сеть / сервер — «Повторить»')
ok(!chatErrorRetryable(403) && !chatErrorRetryable(404), 'нет доступа / нет диалога — повтор не поможет')

if (failed) {
  console.error(`verify-chat-seen: провалов ${failed}`)
  process.exit(1)
}
console.log('verify-chat-seen: всё ок')
