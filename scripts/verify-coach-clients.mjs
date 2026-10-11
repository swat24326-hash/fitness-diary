/**
 * Клиенты на телефоне тренера (view=clients): только свои «Активные», последняя — только завершённая,
 * без лишних полей; запросы к БД ограничены своим тренером, длинные списки читаются страницами.
 */
import { buildCoachClients, COACH_CLIENT_FIELDS } from '../api/_lib/coach/coachClientsCore.js'
import { loadCoachClientsRows } from '../api/_lib/coach/coachClientsHandler.js'
import {
  buildCoachClientsView,
  coachBirthdayLabel,
  coachMembershipFact,
  coachMembershipPhase,
  coachTelHref,
} from '../src/lib/coach/coachClientsListCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

const T = 'trainer-1'
const base = { phone: '+79990000000', card_number: '5870', birth_date: '1990-10-12', lifecycle: null, max_chat_url: '', archived_at: null }
const clients = [
  { ...base, id: 'c-anna', name: 'Анна', trainer_id: T, notes: 'секрет' },
  { ...base, id: 'c-boris', name: 'Борис', trainer_id: T },
  { ...base, id: 'c-alien', name: 'Чужой', trainer_id: 'trainer-2' },
  { ...base, id: 'c-arch', name: 'Архив', trainer_id: T, archived_at: '2026-01-01T00:00:00Z' },
  { ...base, id: 'c-pzclosed', name: 'ПЗ закрыт', trainer_id: T },
]
const out = buildCoachClients({
  trainerId: T,
  clients,
  memberships: [
    { id: 'm1', client_id: 'c-anna', start_date: '2026-09-01', end_date: '2026-11-10', total_trainings: 10, used_trainings: 3, membership_type_id: 'tp' },
    { id: 'm0', client_id: 'c-anna', start_date: '2026-06-01', end_date: '2026-08-31', total_trainings: 8, used_trainings: 8, membership_type_id: 'tp' },
    { id: 'mx', client_id: 'c-alien', start_date: '2026-09-01', end_date: '2026-11-10', total_trainings: 10, used_trainings: 0 },
  ],
  lifecycleRows: [{ client_id: 'c-pzclosed', hall: 'pz', closed_at: '2026-09-01T00:00:00Z' }],
  trainings: [
    { client_id: 'c-anna', date: '2026-10-01', status: 'completed' },
    { client_id: 'c-anna', date: '2026-10-09', status: 'draft' },
    { client_id: 'c-anna', date: '2026-09-20', status: 'completed' },
    { client_id: 'c-alien', date: '2026-10-10', status: 'completed' },
  ],
  typeCodeById: { tp: 'ПЗ 10' },
})

ok(out.map((c) => c.id).join(',') === 'c-anna,c-boris', 'только свои активные: без чужого, архива клуба и закрытого ПЗ')
const anna = out[0]
ok(anna.last_training_date === '2026-10-01', 'последняя — только завершённая (черновик 09.10 не считается)')
ok(out[1].last_training_date === null, 'без тренировок — последняя пусто')
ok(anna.memberships.map((m) => m.id).join(',') === 'm1,m0', 'абонементы клиента, свежие сверху')
ok(anna.memberships[0].type_name === 'ПЗ 10', 'название типа абонемента')
ok(!('notes' in anna) && !('trainer_id' in anna) && !('archived_at' in anna), 'лишние поля клиента не уходят на телефон')
ok(anna.phone === '+79990000000' && anna.card_number === '5870', 'телефон и карта — для «Позвонить» и строки')
ok(!COACH_CLIENT_FIELDS.includes('notes'), 'выборка клиентов без заметок')

/** Поддельная БД: пишет фильтры каждого запроса, отдаёт строки страницами. */
function fakeDb(tables) {
  const log = []
  return {
    log,
    from(table) {
      const q = { table, eq: {}, in: {}, range: null }
      log.push(q)
      const api = {
        select: () => api,
        order: () => api,
        is: (k, v) => ((q.eq[k] = v), api),
        eq: (k, v) => ((q.eq[k] = v), api),
        gte: () => api,
        in: (k, v) => ((q.in[k] = v), api),
        range: (a, b) => {
          q.range = [a, b]
          let list = tables[table] ?? []
          for (const [k, v] of Object.entries(q.eq)) list = list.filter((r) => (r[k] ?? null) === v)
          for (const [k, v] of Object.entries(q.in)) list = list.filter((r) => v.includes(r[k]))
          return Promise.resolve({ data: list.slice(a, b + 1), error: null })
        },
      }
      return api
    },
  }
}

const manyTrainings = Array.from({ length: 1500 }, (_, i) => ({
  id: `t${i}`,
  client_id: 'c-anna',
  trainer_id: T,
  status: 'completed',
  date: i === 1499 ? '2026-10-10' : '2026-01-01',
}))
const db = fakeDb({
  clients: clients.map((c) => ({ ...c })),
  memberships: [{ id: 'm1', client_id: 'c-anna', membership_type_id: 'tp' }],
  client_hall_lifecycle: [],
  trainings: [...manyTrainings, { id: 'tz', client_id: 'c-alien', trainer_id: 'trainer-2', status: 'completed', date: '2026-10-11' }],
  membership_types: [{ id: 'tp', code: 'ПЗ 10' }],
})
const rows = await loadCoachClientsRows(db, T, '2026-10-11')
const clientQ = db.log.find((q) => q.table === 'clients')
const trainQ = db.log.filter((q) => q.table === 'trainings')
ok(clientQ.eq.trainer_id === T && clientQ.eq.archived_at === null, 'клиенты: только свои и не в архиве')
ok(trainQ.every((q) => q.eq.trainer_id === T && q.eq.status === 'completed'), 'тренировки: только свои завершённые')
ok(trainQ.length === 2 && rows.trainings.length === 1500, 'больше 1000 тренировок — дочитаны страницами')
ok(!rows.clients.some((c) => c.trainer_id !== T), 'чужие клиенты не загружены')
ok(rows.typeCodeById.tp === 'ПЗ 10', 'названия типов абонементов')
const built = buildCoachClients({ trainerId: T, ...rows })
ok(built.find((c) => c.id === 'c-anna')?.last_training_date === '2026-10-10', 'последняя с последней страницы')

// --- Экран телефона: те же фильтры и подписи, что на планшете ---
const today = '2026-10-11'
const phoneClients = [
  { id: 'a', name: 'Анна', phone: '+7 999 111', card_number: '5870', birth_date: '1990-10-11', lifecycle: null, last_training_date: '2026-10-01' },
  { id: 'b', name: 'Борис', phone: '', card_number: '3334', birth_date: null, lifecycle: null, last_training_date: null },
  { id: 'c', name: 'Вера', phone: '', card_number: '', birth_date: null, lifecycle: 'pnk', last_training_date: null },
]
const memByClient = {
  a: [{ id: 'ma', start_date: '2026-09-01', end_date: '2026-10-14', total_trainings: 10, used_trainings: 3, membership_type_id: 't' }],
  b: [
    { id: 'mb2', start_date: '2026-10-20', end_date: '2026-12-20', total_trainings: 8, used_trainings: 0, membership_type_id: 't' },
    { id: 'mb1', start_date: '2026-08-01', end_date: '2026-09-29', total_trainings: 10, used_trainings: 6, membership_type_id: 't' },
  ],
  c: [],
}
const view = (filter, query = '') => buildCoachClientsView({ clients: phoneClients, memByClient, today, filter, query })
const all = view('all')
ok(all.total === 3 && all.counts.all === 3, 'все: три клиента')
for (const key of ['pnk', 'expiring', 'expired_recent', 'stale', 'inactive']) {
  ok(view(key).total === all.counts[key], `чип «${key}» = длина списка`)
}
ok(view('expiring').items.map((i) => i.client.id).join() === 'a', 'истекает: Анна (до 14.10)')
ok(view('pnk').items.map((i) => i.client.id).join() === 'c', 'ПНК: Вера')
ok(view('all', '3334').items.map((i) => i.client.id).join() === 'b', 'поиск по карте')
ok(view('all', '111').items.map((i) => i.client.id).join() === 'a', 'поиск по телефону')
ok(view('birthdays').items[0]?.type === 'section', 'ДР: блок «Сегодня» сверху')
ok(coachMembershipFact(memByClient.a, today) === 'до 14.10.2026 · 3/10', 'строка: идущий абонемент')
ok(coachMembershipFact(memByClient.b, today) === 'истёк 29.09.2026 · 6/10', 'строка: истёк с остатком — как на планшете')
ok(/начнётся 20\.10\.2026/.test(coachMembershipFact([memByClient.b[0]], today)), 'строка: только следующий — ждёт старт')
ok(coachMembershipFact([], today) === 'нет абонемента', 'строка: нет абонемента')
ok(coachMembershipPhase(memByClient.a[0], memByClient.a, today) === 'current', 'шторка: идёт')
ok(coachMembershipPhase(memByClient.b[0], memByClient.b, today) === 'upcoming', 'шторка: ждёт старт')
ok(coachMembershipPhase(memByClient.b[1], memByClient.b, today) === 'past', 'шторка: закончился')
const depleted = { id: 'md', start_date: '2026-10-01', end_date: '2026-10-31', total_trainings: 4, used_trainings: 4 }
ok(coachMembershipPhase(depleted, [depleted], today) === 'depleted', 'шторка: срок идёт, занятия кончились')
ok(coachTelHref('+7 (999) 111-22-33') === 'tel:+79991112233', 'позвонить: номер без пробелов и скобок')
ok(coachTelHref('8 999 111 22 33') === 'tel:89991112233' && coachTelHref('') === null, 'позвонить: без + и без номера')
ok(/завтра/.test(coachBirthdayLabel('1990-10-12', today, 'all') ?? ''), 'ДР завтра — в строке')
ok(coachBirthdayLabel('1990-11-20', today, 'all') === null, 'ДР через месяц — не в строке')
ok(coachBirthdayLabel('1990-11-01', today, 'birthdays') !== null, 'в фильтре «ДР» — всегда')

if (failed) {
  console.error(`\nverify-coach-clients: ${failed} failed`)
  process.exit(1)
}
console.log('\nverify-coach-clients: all passed')
