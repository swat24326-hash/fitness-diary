/**
 * Лента переписки прижата к низу при открытии / закрытии клавиатуры, если человек был внизу.
 * node scripts/verify-chat-stick-bottom.mjs
 */
import { CHAT_BOTTOM_SLACK_PX, chatNewMessageAction, isChatNearBottom } from '../src/lib/chat/chatStickToBottom.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const near = (scrollHeight, scrollTop, visibleBottom) => isChatNearBottom({ scrollHeight, scrollTop, visibleBottom })

ok(near(2000, 1220, 780), 'в самом низу — прижимаем')
ok(near(2000, 1220 - CHAT_BOTTOM_SLACK_PX, 780), `чуть выше низа (≤ ${CHAT_BOTTOM_SLACK_PX}px) — тоже внизу`)
ok(!near(2000, 1220 - CHAT_BOTTOM_SLACK_PX - 1, 780), 'листает историю выше — позицию не трогаем')
ok(!near(2000, 0, 780), 'в начале длинной ленты — не внизу')
ok(near(600, 0, 780), 'лента короче экрана — внизу')
ok(near(2000, 1000, 1000), 'видимая часть сдвинута вниз (клавиатура iPhone) — считаем по её нижнему краю')
ok(near(2000, 'x', 780), 'битые числа — по умолчанию прижимаем (как до правки при новом сообщении)')

const act = (firstLoad, mine, atBottom) => chatNewMessageAction({ firstLoad, mine, atBottom })
ok(act(true, false, false) === 'scroll', 'открыли диалог — сразу к последнему сообщению')
ok(act(false, true, false) === 'scroll', 'своё сообщение — всегда вниз, даже из истории')
ok(act(false, false, true) === 'scroll', 'был внизу, ответил собеседник — вниз')
ok(act(false, false, false) === 'badge', 'читает историю, пришло новое — не дёргаем, кнопка «↓ Новые»')

console.log('verify-chat-stick-bottom: all passed')
