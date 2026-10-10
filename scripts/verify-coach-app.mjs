/**
 * Телефон тренера (/coach): куда ведёт push на телефоне, что уходит в расписании (белый список),
 * подписка помнит приложение. Без базы и сети.
 * node scripts/verify-coach-app.mjs
 */
import { buildCoachMe, buildCoachSchedule, coachScheduleDays } from '../api/_lib/coach/coachViewCore.js'
import { handlePushSubscriptionPost } from '../api/_lib/pushSubscriptionHandler.js'
import { buildChatPushPayload } from '../api/_lib/chat/chatPushJob.js'
import { PUSH_APP_COACH, coachPushUrl, pushUrlForApp } from '../src/lib/push/pushTargetUrlCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const CLIENT = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'

// --- Куда ведёт push ---
const chatPayload = buildChatPushPayload({ kind: 'trainer', authorSide: 'client', clientId: CLIENT, clientName: 'Анна', authorName: '', body: 'Опоздаю' })
ok(coachPushUrl(chatPayload.url) === `/coach/chat/${CLIENT}`, 'сообщение клиента → диалог на телефоне')
ok(pushUrlForApp(chatPayload.url, 'staff') === chatPayload.url, 'планшет получает прежний адрес')
ok(pushUrlForApp(chatPayload.url, undefined) === chatPayload.url, 'подписка без пометки (клиент, старая строка) — адрес не меняется')
ok(coachPushUrl('/trainer?inbox=1') === '/coach', 'задание Планёрки → «Сегодня» на телефоне, не планшетный экран')
ok(coachPushUrl('/messages') === '/coach', 'рассылка клуба → «Сегодня»')
ok(coachPushUrl(`/messages/chat/${CLIENT}/sales`) === '/coach', 'диалог менеджера на телефон тренера не ведёт')
ok(coachPushUrl(`/messages/chat/${CLIENT}/trainer/../../admin`) === `/coach/chat/${CLIENT}`, 'адрес собирается из id, хвост не протаскивается')
ok(coachPushUrl('') === '/coach' && coachPushUrl(null) === '/coach', 'пустой адрес → /coach')

// --- Расписание: сегодня и завтра, только имя, время и подпись ---
ok(coachScheduleDays('2026-12-31').join() === '2026-12-31,2027-01-01', 'завтра через границу года')
const base = { club_id: 'club', trainer_id: 'tr', duration_minutes: 60, title: '' }
const schedule = buildCoachSchedule(
  [
    { ...base, id: 's2', day_date: '2026-10-12', start_minutes: 18 * 60, client_ids: ['c1'], linked_training_id: 'tr-1' },
    { ...base, id: 's1', day_date: '2026-10-12', start_minutes: 9 * 60, client_ids: ['c1', 'c2'] },
    { ...base, id: 's3', day_date: '2026-10-13', start_minutes: 10 * 60, client_ids: [], title: 'Планёрка зала' },
    { ...base, id: 's4', day_date: '2026-10-14', start_minutes: 10 * 60, client_ids: ['c1'] },
    { ...base, id: 's5', day_date: '2026-10-12', start_minutes: 11 * 60, client_ids: ['foreign'] },
  ],
  { c1: 'Анна', c2: 'Олег' },
  '2026-10-12',
)
ok(schedule.length === 2 && schedule[0].label === 'Сегодня' && schedule[1].label === 'Завтра', 'два дня: сегодня и завтра')
ok(schedule[0].items.map((i) => i.id).join() === 's1,s5,s2', 'слоты по времени')
ok(schedule[0].items[0].title === 'Анна, Олег' && schedule[0].items[0].clients === 2, 'несколько клиентов — имена через запятую')
ok(schedule[0].items[1].title === 'Клиент', 'чужой клиент без имени — «Клиент»')
ok(schedule[0].items[2].started === true && schedule[0].items[2].time === '18:00–19:00', 'начатая тренировка помечена, время диапазоном')
ok(schedule[1].items[0].title === 'Планёрка зала', 'заметка без клиентов — подпись слота')
ok(!schedule.flatMap((d) => d.items).some((i) => i.id === 's4'), 'послезавтра не уходит')
const keys = new Set(schedule.flatMap((d) => d.items).flatMap((i) => Object.keys(i)))
ok([...keys].sort().join() === 'clients,id,start_minutes,started,time,title', 'белый список: без id клиентов, тренировки и клуба')
ok(Object.keys(buildCoachMe({ name: ' Пётр ', phone: '+7', email: 'x', login: 'p' })).join() === 'name', 'профиль — только имя')

// --- Подписка помнит приложение ---
function fakeDb() {
  const calls = []
  return {
    calls,
    from(table) {
      return {
        upsert(row, opts) {
          calls.push({ table, row, opts })
          return { select: () => ({ maybeSingle: async () => ({ data: { id: 'sub-1' }, error: null }) }) }
        },
      }
    },
  }
}
function fakeRes() {
  const res = { statusCode: 200, body: null, setHeader() {}, end: (b) => (res.body = JSON.parse(b)) }
  return res
}
const sub = { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' }
const coachDb = fakeDb()
await handlePushSubscriptionPost({ user: { id: 'tr' }, supabaseAdmin: coachDb, pushApp: PUSH_APP_COACH }, fakeRes(), { op: 'subscribe', ...sub })
ok(coachDb.calls[0]?.row.app === 'coach', 'подписка с телефона — app coach')
const staffDb = fakeDb()
await handlePushSubscriptionPost({ user: { id: 'tr' }, supabaseAdmin: staffDb }, fakeRes(), { op: 'subscribe', ...sub })
ok(staffDb.calls[0]?.row.app === 'staff', 'подписка планшета — app staff (тот же браузер снова уводит push на планшет)')

if (failed) {
  console.error(`\nverify-coach-app: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-coach-app: OK')
