/**
 * Живой просмотр приложения клиента (/me) на тестовых данных — для правки интерфейса без входа на прод.
 * Окно iPhone, клиент уже вошёл по ссылке; правки кода видны сразу (Vite). Закрыть окно — выход.
 * Запуск: node scripts/e2e/preview-client.mjs
 */
import { chromium } from 'playwright'
import { clientRatingCopy, publicClientRating } from '../../src/lib/client/clientRatingCore.js'
import { createFakeBackend } from './lib/fakeBackend.mjs'
import { createFakeChat } from './lib/fakeChat.mjs'
import { createFakeClientPortal } from './lib/fakeClientPortal.mjs'
import { ORIGIN, newE2eContext, startDevServer } from './lib/e2eHarness.mjs'
import { CLIENT_ID, TRAINER_ID, isoDay, weightHistorySeed } from './lib/fixtures.mjs'

const INVITE = 'preview-invite'
const backend = createFakeBackend(weightHistorySeed())
const chat = createFakeChat(backend.state)
chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', body: 'Можно перенести четверг на вечер?' })
const daysAgo = (n, hh) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 11) + `${hh}:00:00.000Z`
const plan = (id, kind, sentAt, payload, seen) => ({
  id: `00000000-0000-4000-8000-0000000000${id}`,
  client_id: CLIENT_ID,
  kind,
  sent_by: TRAINER_ID,
  sent_at: sentAt,
  client_seen_at: seen ? sentAt : null,
  payload,
})
backend.state.client_plans = [
  plan('a1', 'homework', daysAgo(6, '15'), {
    title: 'Домашнее задание',
    blocks: [{ label: 'Основное', exercises: [{ name: 'Планка', sets: 3, reps: '40 с', rest_sec: 30 }] }],
  }, true),
  plan('a2', 'homework', daysAgo(0, '10'), {
    title: 'Спина и пресс',
    comment: 'Через день, без боли. Если тянет поясницу — пропусти скручивания.',
    blocks: [
      { label: 'Разминка', exercises: [{ name: 'Кошка-корова', sets: 2, reps: '10', rest_sec: 0 }] },
      {
        label: 'Основное',
        exercises: [
          { name: 'Тяга резинки к поясу', sets: 3, reps: '15', rest_sec: 45 },
          { name: 'Супермен', sets: 3, reps: '12', rest_sec: 30 },
          { name: 'Скручивания', sets: 3, reps: '20', rest_sec: 30 },
        ],
      },
    ],
  }, false),
  plan('b1', 'nutrition', daysAgo(3, '12'), {
    goal: 'Снижение веса',
    kcal_target: 1850,
    totals: { kcal: 1840, proteinG: 125, fatG: 60, carbsG: 195 },
    meals: [
      { label: 'Завтрак', items: [{ label: 'Овсянка на воде', portion: '60 г сухой', kcal: 220, proteinG: 8, fatG: 4, carbsG: 38 }, { label: 'Яйца', portion: '2 шт', kcal: 155, proteinG: 13, fatG: 11, carbsG: 1 }], subtotal: { kcal: 375, proteinG: 21, fatG: 15, carbsG: 39 } },
      { label: 'Обед', items: [{ label: 'Куриная грудка', portion: '150 г', kcal: 245, proteinG: 46, fatG: 5, carbsG: 0 }, { label: 'Гречка', portion: '70 г сухой', kcal: 240, proteinG: 9, fatG: 2, carbsG: 45 }], subtotal: { kcal: 485, proteinG: 55, fatG: 7, carbsG: 45 } },
    ],
  }, true),
]
const portal = createFakeClientPortal(backend.state, {
  clientId: CLIENT_ID,
  inviteToken: INVITE,
  today: isoDay(0),
  schedule: [
    { day_date: isoDay(2), start_minutes: 600, duration_minutes: 60, trainer_id: TRAINER_ID },
    { day_date: isoDay(4), start_minutes: 1080, duration_minutes: 60, trainer_id: TRAINER_ID },
  ],
})
const inboxSurvey = {
  id: 'd-preview-survey',
  kind: 'survey',
  title: 'Как вам зал?',
  sent_at: daysAgo(0, '09'),
  status: 'new',
  open: true,
  reward_points: 50,
  attention: true,
  body: 'Короткий опрос — пара минут.',
  questions: [{ id: 'q1', type: 'rating', text: 'Оцените атмосферу', required: true }],
}
/** Три вида оценок в ленте — чтобы глянуть вид (абонемент / задание / рацион). */
const previewRatings = [
  {
    id: 'r-membership',
    kind: 'membership',
    client_id: CLIENT_ID,
    requested_at: daysAgo(0, '08'),
    created_at: daysAgo(0, '08'),
    answered_at: null,
    dismissed_at: null,
    score: null,
    comment: null,
  },
  {
    id: 'r-homework',
    kind: 'homework',
    client_id: CLIENT_ID,
    requested_at: daysAgo(1, '14'),
    created_at: daysAgo(1, '14'),
    answered_at: null,
    dismissed_at: null,
    score: null,
    comment: null,
  },
  {
    id: 'r-nutrition',
    kind: 'nutrition',
    client_id: CLIENT_ID,
    requested_at: daysAgo(2, '11'),
    created_at: daysAgo(2, '11'),
    answered_at: null,
    dismissed_at: null,
    score: null,
    comment: null,
  },
]
const ratingById = Object.fromEntries(previewRatings.map((r) => [r.id, r]))
backend.clientMe = (req) => {
  const authed = /^Bearer .+/.test(String(req.headers.authorization ?? ''))
  if (authed && req.path === '/api/client-me' && req.method === 'POST') {
    const action = String(req.body?.action ?? '')
    if (action.startsWith('chat-')) return chat.client(CLIENT_ID, req.body)
    if (action === 'inbox-list') {
      return { status: 200, json: { items: [inboxSurvey], attention: 1, points: 0 } }
    }
    if (action === 'inbox-item' && String(req.body?.id) === inboxSurvey.id) {
      return { status: 200, json: { item: { ...inboxSurvey, status: 'read', attention: false } } }
    }
    if (action === 'rating-get') {
      const row = ratingById[String(req.body?.id ?? '')]
      if (!row) return { status: 404, json: { error: 'Оценка не найдена' } }
      return { status: 200, json: { rating: publicClientRating(row), copy: clientRatingCopy(row.kind) } }
    }
    if (action === 'rating-answer') {
      const row = ratingById[String(req.body?.id ?? '')]
      if (!row) return { status: 404, json: { error: 'Оценка не найдена' } }
      row.answered_at = new Date().toISOString()
      row.score = Number(req.body?.score) || 5
      row.comment = String(req.body?.comment ?? '').trim().slice(0, 300) || null
      return { status: 200, json: { rating: publicClientRating(row) } }
    }
    if (action === 'rating-dismiss') {
      const row = ratingById[String(req.body?.id ?? '')]
      if (!row) return { status: 404, json: { error: 'Оценка не найдена' } }
      row.dismissed_at = new Date().toISOString()
      return { status: 200, json: { rating: publicClientRating(row) } }
    }
  }
  const res = portal(req)
  if (req.path === '/api/client-me' && req.method === 'GET' && res.json?.as_of) {
    res.json.chat_attention = chat.attentionForClient(CLIENT_ID)
    res.json.inbox_attention = 1
    res.json.ratings = previewRatings.map((r) => publicClientRating(r)).filter(Boolean)
  }
  return res
}

const server = await startDevServer()
const browser = await chromium.launch({ headless: false })
const context = await newE2eContext(browser, backend, {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
})
const page = await context.newPage()
await page.goto(`${ORIGIN}/me/join#t=${INVITE}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForURL(`${ORIGIN}/me/`, { timeout: 60_000 })
await page.goto(`${ORIGIN}/me/notifications`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
console.log(`Уведомления клиента: ${ORIGIN}/me/notifications (тестовые данные). Закройте окно, чтобы выйти.`)

browser.on('disconnected', () => {
  server.stop()
  process.exit(0)
})
