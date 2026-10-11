/**
 * Push переписки — круглосуточно (человек написал сам); тихие часы 22:00–9:00 — только у рассылок.
 * node scripts/verify-chat-push-hours.mjs
 */
const key = Buffer.alloc(65, 7)
key[0] = 0x04
process.env.VAPID_PUBLIC_KEY = key.toString('base64url')
process.env.VAPID_PRIVATE_KEY = 'x'.repeat(43)

/* 23:20 по Москве — тихие часы. */
const NIGHT = Date.parse('2026-10-11T20:20:00Z')
const RealDate = Date
globalThis.Date = class extends RealDate {
  constructor(...a) {
    super(...(a.length ? a : [NIGHT]))
  }
  static now() {
    return NIGHT
  }
}

const { chatPushBlocker, sendChatPush } = await import('../api/_lib/chat/chatPushJob.js')
const { sendStaffDmPush } = await import('../api/_lib/chat/staffDmPushJob.js')
const { inboxPushBlocker } = await import('../api/_lib/inbox/inboxPushJob.js')

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const TABLES = {
  user_push_subscriptions: [{ id: 's1', user_id: 'u-sup', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', app: 'coach' }],
  client_push_subscriptions: [{ id: 'c1', client_id: 'cl-1', session_id: 'sess-1', endpoint: 'https://push.example/2', p256dh: 'p', auth: 'a' }],
  client_sessions: [{ id: 'sess-1' }],
}
function fakeDb() {
  return {
    from(table) {
      const q = {
        select: () => q,
        in: () => q,
        is: () => q,
        eq: () => q,
        delete: () => q,
        then: (res, rej) => Promise.resolve({ data: TABLES[table] ?? [], error: null }).then(res, rej),
      }
      return q
    },
  }
}

ok(inboxPushBlocker(new Date(NIGHT)) === 'quiet', 'рассылки в 23:20 — по-прежнему тихие часы')
ok(chatPushBlocker(true) === null, 'переписка: push настроен — шлём в любое время')
ok(chatPushBlocker(false) === 'off', 'переписка: push не настроен на сервере — не шлём')

const sent = []
const send = async (row, payload) => {
  sent.push({ row, payload })
  return { ok: true }
}

const dm = await sendStaffDmPush(fakeDb(), { recipientId: 'u-sup', authorId: 'u-trainer', authorName: 'Анна', body: 'Сломан тренажёр' }, send)
ok(dm.sent === 1 && sent[0]?.row.id === 's1', 'личное сообщение коллеге в 23:20 — push ушёл')

const client = { id: 'cl-1', name: 'Мария', trainer_id: 'u-trainer', club_id: 'club-1' }
const toClient = await sendChatPush(
  fakeDb(),
  { kind: 'trainer', authorSide: 'staff', client, authorUserId: 'u-trainer', authorName: 'Анна', body: 'Привет' },
  send,
)
ok(toClient.sent === 1 && sent[1]?.row.id === 'c1', 'ответ тренера клиенту в 23:20 — push ушёл')

console.log('verify-chat-push-hours: all passed')
