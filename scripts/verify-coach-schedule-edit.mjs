/**
 * Ежедневник с телефона: что телефон может менять, защита от перезаписи правки планшета (409),
 * перенос записи с тренировкой, метка updated_at для pull планшета. Без базы и сети.
 * node scripts/verify-coach-schedule-edit.mjs
 */
import {
  COACH_SCHEDULE_CONFLICT_RU,
  COACH_SCHEDULE_EMPTY_RU,
  COACH_SCHEDULE_GONE_RU,
  COACH_SCHEDULE_LOCKED_RU,
  COACH_SCHEDULE_SAME_DAY_RU,
  buildCoachScheduleRow,
  coachScheduleMoveDenial,
  isCoachScheduleConflict,
  nextCoachScheduleUpdatedAt,
  normalizeCoachScheduleCopyDays,
  resolveCoachScheduleRange,
  resolveCoachScheduleWindow,
} from '../src/lib/trainer/coachScheduleEditCore.js'
import { runCoachScheduleWrite } from '../api/_lib/coach/coachScheduleWriteCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const TRAINER = 'tttttttt-1111-4111-8111-tttttttttttt'
const OTHER = 'oooooooo-1111-4111-8111-oooooooooooo'
const CLUB = 'cccccccc-1111-4111-8111-cccccccccccc'
const CLIENT = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const NOW = Date.parse('2026-10-11T09:00:00.000Z')
const STORED = {
  id: 'e1',
  club_id: CLUB,
  trainer_id: TRAINER,
  day_date: '2026-10-12',
  start_minutes: 600,
  duration_minutes: 60,
  title: '',
  client_ids: [CLIENT],
  linked_training_id: null,
  kind: null,
  created_at: '2026-10-01T08:00:00.000Z',
  updated_at: '2026-10-10T08:00:00.000Z',
}

// --- Период ---
ok(resolveCoachScheduleRange('2026-10-01', '2026-11-01')?.to === '2026-11-01', 'месяц с хвостами — допустимый период')
ok(resolveCoachScheduleRange('2026-10-01', '2026-12-15') === null, 'больше 62 дней — отказ')
ok(resolveCoachScheduleRange('2026-10-05', '2026-10-01') === null, 'конец раньше начала — отказ')
ok(resolveCoachScheduleRange('вчера', '2026-10-01') === null, 'не дата — отказ')
let win = resolveCoachScheduleWindow(2026, 2, [])
ok(win.from === '2026-02-01' && win.to === '2026-02-28', 'месяц: с первого по последний день')
win = resolveCoachScheduleWindow(2026, 10, ['2026-10-30', '2026-10-31', '2026-11-01'])
ok(win.from === '2026-10-01' && win.to === '2026-11-01', '3 дня на стыке месяцев — грузим и соседний день')
win = resolveCoachScheduleWindow(2026, 1, ['2026-10-12'])
ok(win.from === '2026-10-12' && win.to === '2026-10-12', 'день далеко от месяца — грузим только его, не больше 62 дней')

// --- 409 ---
ok(!isCoachScheduleConflict(STORED, '2026-10-10T08:00:00Z'), 'та же метка в другом формате — не конфликт')
ok(isCoachScheduleConflict(STORED, '2026-10-09T08:00:00.000Z'), 'планшет правил позже — конфликт')
ok(isCoachScheduleConflict(STORED, ''), 'телефон не прислал метку — считаем конфликтом, не перезаписываем')
ok(!isCoachScheduleConflict(null, ''), 'новая запись — без проверки')

// --- updated_at ---
ok(nextCoachScheduleUpdatedAt(STORED.updated_at, NOW) === new Date(NOW).toISOString(), 'обычная правка — текущее время')
ok(
  nextCoachScheduleUpdatedAt('2026-10-11T10:00:00.000Z', NOW) === '2026-10-11T10:00:00.001Z',
  'часы сервера отстают — метка всё равно новее прежней',
)

// --- Сборка строки ---
const edited = buildCoachScheduleRow({
  input: { start_minutes: 660, trainer_id: OTHER, club_id: 'x', linked_training_id: 'tr-x', created_at: '2000-01-01' },
  existing: { ...STORED, linked_training_id: 'tr-1', kind: 'fit' },
  trainerId: TRAINER,
  clubId: CLUB,
  newId: 'new',
  nowMs: NOW,
})
ok(edited.ok && edited.row.start_minutes === 660, 'время меняется')
ok(edited.row.trainer_id === TRAINER && edited.row.club_id === CLUB, 'владелец и клуб — с сервера, не из запроса')
ok(edited.row.linked_training_id === 'tr-1', 'связь с тренировкой телефон не трогает')
ok(edited.row.created_at === STORED.created_at, 'дата создания сохраняется')
ok(edited.row.client_ids[0] === CLIENT && edited.row.duration_minutes === 60, 'непереданные поля остаются как были')
ok(!('synced' in edited.row), 'служебное synced не уходит в базу')

const created = buildCoachScheduleRow({
  input: { day_date: '2026-10-13', start_minutes: 540, title: 'Растяжка' },
  trainerId: TRAINER,
  clubId: CLUB,
  newId: 'n1',
  nowMs: NOW,
})
ok(created.ok && created.row.id === 'n1' && created.row.linked_training_id === null, 'новая запись — id сервера, без тренировки')
const empty = buildCoachScheduleRow({ input: { day_date: '2026-10-13', title: ' ' }, trainerId: TRAINER, clubId: CLUB, newId: 'n2', nowMs: NOW })
ok(!empty.ok && empty.error === COACH_SCHEDULE_EMPTY_RU, 'без клиента и заметки — понятная ошибка')

// --- Перенос ---
const moved = (patch) => ({ ...STORED, ...patch })
ok(coachScheduleMoveDenial(STORED, moved({ day_date: '2026-10-14' }), null) === null, 'без тренировки — переносится куда угодно')
const linked = { ...STORED, linked_training_id: 'tr-1' }
ok(coachScheduleMoveDenial(linked, moved({ start_minutes: 720 }), 'draft') === null, 'черновик — другое время того же дня можно')
ok(coachScheduleMoveDenial(linked, moved({ day_date: '2026-10-14' }), 'draft') === COACH_SCHEDULE_SAME_DAY_RU, 'черновик — на другой день нельзя')
ok(coachScheduleMoveDenial(linked, moved({ start_minutes: 720 }), 'completed') === COACH_SCHEDULE_LOCKED_RU, 'завершённая — не двигается')
ok(coachScheduleMoveDenial(linked, moved({ title: 'Заметка' }), 'completed') === null, 'завершённая — подпись править можно')

// --- Повтор ---
const days = normalizeCoachScheduleCopyDays(['2026-10-19', '2026-10-12', 'x', '2026-10-19', '2026-10-26'], '2026-10-12')
ok(days.join(',') === '2026-10-19,2026-10-26', 'повтор: без дублей, мусора и дня самой записи')

// --- Запись через сервер (поддельная база и push) ---
function fakeDb(rowsById, trainings = {}) {
  return {
    from(table) {
      const filters = {}
      const q = {
        select: () => q,
        eq: (k, v) => ((filters[k] = v), q),
        in: (k, v) => ((filters[k] = v), q),
        then(resolve) {
          if (table === 'trainer_schedule_entries') {
            const row = rowsById[filters.id]
            const mine = row && row.trainer_id === filters.trainer_id
            return resolve({ data: mine ? [row] : [], error: null })
          }
          const ids = filters.id ?? []
          return resolve({ data: ids.filter((id) => trainings[id]).map((id) => ({ id, status: trainings[id] })), error: null })
        },
      }
      return q
    },
  }
}
const pushes = []
const ctx = (db) => ({ supabaseAdmin: db, user: { id: TRAINER }, profile: { club_id: CLUB }, isTrainer: true })
const push = async (_ctx, item) => (pushes.push(item), { ok: true })
const write = (db, op, body) => runCoachScheduleWrite(ctx(db), op, body, { push, nowMs: NOW, newId: () => 'gen-1' })

const db = fakeDb({ e1: STORED, e2: { ...STORED, id: 'e2', linked_training_id: 'tr-done' }, foreign: { ...STORED, id: 'foreign', trainer_id: OTHER } }, { 'tr-done': 'completed' })

let r = await write(db, 'schedule-save', { entry: { id: 'e1', start_minutes: 720 }, base_updated_at: STORED.updated_at })
ok(r.status === 200 && r.body.entry.start_minutes === 720, 'правка своей записи сохраняется')
ok(pushes.at(-1)?.operation === 'update' && pushes.at(-1)?.remote_id === 'e1', 'правка идёт через общий push (authorizePush)')

r = await write(db, 'schedule-save', { entry: { id: 'e1', start_minutes: 720 }, base_updated_at: '2026-10-09T00:00:00Z' })
ok(r.status === 409 && r.body.error === COACH_SCHEDULE_CONFLICT_RU, 'устаревшая правка — 409 с понятным текстом')

r = await write(db, 'schedule-save', { entry: { id: 'foreign', start_minutes: 720 }, base_updated_at: STORED.updated_at })
ok(r.status === 404 && r.body.error === COACH_SCHEDULE_GONE_RU, 'чужая запись не видна — как удалённая')

r = await write(db, 'schedule-save', { entry: { id: 'e2', day_date: '2026-10-15' }, base_updated_at: STORED.updated_at })
ok(r.status === 409 && r.body.error === COACH_SCHEDULE_LOCKED_RU, 'запись завершённой тренировки не переносится')

const before = pushes.length
r = await write(db, 'schedule-save', { entry: { day_date: '2026-10-13', title: 'Растяжка' } })
ok(r.status === 200 && r.body.entry.id === 'gen-1' && pushes.at(-1)?.operation === 'insert' && pushes.length === before + 1, 'новая запись — insert с id сервера')

r = await write(db, 'schedule-delete', { id: 'e1', base_updated_at: '2026-10-09T00:00:00Z' })
ok(r.status === 409, 'удаление устаревшей записи — 409')
r = await write(db, 'schedule-delete', { id: 'nope', base_updated_at: '' })
ok(r.status === 200 && r.body.ok, 'удаление уже удалённой — ок, без ошибки')
r = await write(db, 'schedule-delete', { id: 'e1', base_updated_at: STORED.updated_at })
ok(r.status === 200 && pushes.at(-1)?.operation === 'delete', 'удаление идёт через общий push')

r = await write(db, 'schedule-copies', { entry: { ...STORED, id: 'e1' }, days: ['2026-10-19', '2026-10-26'] })
ok(r.status === 200 && r.body.created === 2, 'повтор создаёт копии на выбранные дни')
ok(pushes.at(-1)?.data?.linked_training_id === null, 'копия без тренировки')

const failPush = async () => ({ ok: false, status: 403, error: 'Нет доступа к клиенту' })
r = await runCoachScheduleWrite(ctx(db), 'schedule-save', { entry: { day_date: '2026-10-13', client_ids: [OTHER] } }, { push: failPush, nowMs: NOW, newId: () => 'g' })
ok(r.status === 403 && r.body.error === 'Нет доступа к клиенту', 'отказ authorizePush доходит до телефона')

if (failed) {
  console.error(`\n${failed} проверок не прошли`)
  process.exit(1)
}
console.log('\nverify-coach-schedule-edit: всё ок')
