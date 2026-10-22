/**
 * Авто-ДЗ по воскресеньям: ближайшее воскресенье и неделя блока, настройки и права на запись,
 * причины паузы, предпросмотр = отправка, cron без дублей, проводка таблицы homework_auto в sync.
 */
import { existsSync, readFileSync } from 'node:fs'
import {
  assertHomeworkAutoPush,
  buildHomeworkAutoPlan,
  buildHomeworkAutoWeek,
  healthLimitsText,
  homeworkAutoHoldReason,
  homeworkAutoNextBlockSunday,
  homeworkAutoPlanId,
  homeworkAutoRowId,
  homeworkAutoUpcomingSunday,
  homeworkAutoWeekOf,
  homeworkWeekSendIso,
  homeworkStableUuid,
  nextHomeworkAutoSunday,
  normalizeHomeworkAutoRow,
} from '../src/lib/homework/auto/homeworkAutoScheduleCore.js'
import { buildHomeworkAppSnapshot } from '../src/lib/homework/homeworkAppSendCore.js'
import { normalizeClientPlanPushPayload } from '../src/lib/clientPlans/clientPlanCore.js'
import { runHomeworkAutoSend } from '../api/_lib/homeworkAuto/homeworkAutoJob.js'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { PULL_MERGE_GUARD_STORES } from '../src/lib/syncPullGuardCore.js'
import { SYNC_TABLE_PRIORITY } from '../src/lib/syncQueuePriorityCore.js'
import { normalizeTrainerPullPayload } from '../src/lib/trainerPullResponseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const U = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const TRAINER = U(1)
const OTHER = U(2)
const CLUB = U(3)
const C = (n) => U(10 + n)
const SUN = '2026-10-18'

// --- Постоянные id ---
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
ok(UUID_RE.test(homeworkStableUuid('x')), 'постоянный id — валидный UUID')
ok(homeworkAutoRowId(C(1)) === homeworkAutoRowId(C(1)) && homeworkAutoRowId(C(1)) !== homeworkAutoRowId(C(2)), 'одна строка настроек на клиента (одинаковый id с любого планшета)')
ok(homeworkAutoPlanId(C(1), SUN) !== homeworkAutoPlanId(C(1), '2026-10-25'), 'у каждого воскресенья своё задание')

// --- Ближайшее воскресенье ---
ok(nextHomeworkAutoSunday('2026-10-14', 12 * 60) === SUN, 'в среду — ближайшее воскресенье')
ok(nextHomeworkAutoSunday(SUN, 9 * 60 + 59) === SUN, 'в воскресенье до 10:00 — сегодня')
ok(nextHomeworkAutoSunday(SUN, 10 * 60) === '2026-10-25', 'в воскресенье с 10:00 — уже следующее')
ok(nextHomeworkAutoSunday('2026-10-17', 23 * 60) === SUN, 'в субботу вечером — завтра')
ok(homeworkAutoUpcomingSunday(new Date('2026-10-18T06:59:00Z')) === SUN, 'часы клуба (МСК), а не пояс планшета: 9:59 — сегодня')
ok(homeworkAutoUpcomingSunday(new Date('2026-10-18T07:00:00Z')) === '2026-10-25', 'часы клуба: 10:00 — следующее')

// --- Неделя блока ---
const wk = (shift, day) => homeworkAutoWeekOf({ anchor_date: SUN, block_shift: shift }, day)
ok(wk(0, SUN).week === 1 && wk(0, SUN).block === 0, 'первое воскресенье — неделя 1')
ok(wk(0, '2026-11-08').week === 4 && wk(0, '2026-11-08').block === 0, 'четвёртое — неделя 4 того же блока')
ok(wk(0, '2026-11-15').week === 1 && wk(0, '2026-11-15').block === 1, 'пятое — новый набор и снова неделя 1, рассылка идёт')
ok(wk(2, SUN).block === 2, '«другой набор» сдвигает блок')
ok(wk(0, '2026-10-11').week === 1, 'до начала блока — неделя 1, не минус')
ok(homeworkWeekSendIso('2026-10-25', 1, 1) === '2026-10-25', 'неделя 1 уходит в это воскресенье')
ok(homeworkWeekSendIso('2026-10-25', 1, 2) === '2026-11-01', 'неделя 2 — через 7 дней')
ok(homeworkWeekSendIso('2026-10-25', 1, 4) === '2026-11-15', 'неделя 4 — через 21 день')
ok(homeworkWeekSendIso('2026-11-08', 3, 1) === '2026-10-25', 'прошедшая неделя блока — раньше текущего воскресенья')
ok(homeworkAutoNextBlockSunday({ anchor_date: SUN }, SUN) === '2026-11-15', 'повтор с недели 1 — через 4 недели от старта')
ok(homeworkAutoNextBlockSunday({ anchor_date: SUN }, '2026-11-08') === '2026-11-15', 'на 4-й неделе повтор — в следующее воскресенье')

// --- Текст противопоказаний на экране ---
ok(healthLimitsText({ contraindications: 'Грыжа L5', diseases: 'гипертония' }) === 'Грыжа L5 · гипертония', 'противопоказания и болезни — одной строкой')
ok(healthLimitsText({ diseases: ['  ', 'астма'] }) === 'астма', 'пустые строки отброшены')
ok(healthLimitsText({ diseases: 'x'.repeat(200) }).length === 120, 'длинный текст обрезан')
ok(healthLimitsText(null) === '', 'нет карточки — пусто')

// --- Настройки ---
const base = {
  id: homeworkAutoRowId(C(1)),
  client_id: C(1),
  club_id: CLUB,
  enabled: true,
  goal: 'fat_loss',
  level: 1,
  avoid: [],
  sessions: 2,
  sex: 'female',
  limits_ok: false,
  anchor_date: SUN,
  block_shift: 0,
  skip_date: null,
  updated_by: TRAINER,
  updated_at: '2026-10-14T10:00:00Z',
}
const norm = (patch) => normalizeHomeworkAutoRow({ ...base, ...patch })
ok(norm({}).ok, 'корректные настройки проходят')
ok(!norm({ goal: 'magic' }).ok, 'неизвестная цель — отказ')
ok(!norm({ anchor_date: '2026-10-14' }).ok, 'начало блока не воскресенье — отказ')
ok(!norm({ skip_date: '2026-10-17' }).ok, 'пропустить можно только воскресенье')
ok(JSON.stringify(norm({ avoid: ['knees', 'hack', 'knees'] }).data.avoid) === '["knees"]', 'ограничения — только из словаря, без повторов')
ok(norm({ level: 9 }).data.level === 3 && norm({ sessions: 5 }).data.sessions === 2, 'уровень и число занятий в рамках')
ok(!norm({ updated_by: 'x' }).ok, 'без автора — отказ')
ok(!('payload' in norm({ payload: { x: 1 } }).data), 'лишние поля не проходят в таблицу')

// --- Права на запись ---
const client = { id: C(1), trainer_id: TRAINER, club_id: CLUB, archived_at: null }
const push = (p) => assertHomeworkAutoPush({ op: 'insert', isTrainer: true, userId: TRAINER, payload: base, client, ...p })
ok(push({}).ok, 'тренер клиента включает авто-ДЗ')
ok(push({ op: 'update', remoteId: base.id }).ok, 'тренер клиента меняет настройки')
ok(!push({ userId: OTHER, payload: { ...base, updated_by: OTHER } }).ok, 'чужой тренер — нет доступа')
ok(push({ isTrainer: false, isAdmin: true, userId: OTHER, payload: { ...base, updated_by: OTHER } }).ok, 'главный админ — может')
ok(!push({ isTrainer: false }).ok, 'не тренер и не админ — отказ')
ok(!push({ op: 'delete' }).ok, 'удалять нельзя — только выключать')
ok(!push({ payload: { ...base, id: U(99) } }).ok, 'id не от этого клиента — отказ')
ok(!push({ op: 'update', remoteId: U(99) }).ok, 'update чужой строки — отказ')
ok(!push({ payload: { ...base, updated_by: OTHER } }).ok, 'от чужого имени — отказ')
ok(!push({ client: { ...client, archived_at: '2026-10-01' } }).ok, 'архивный клиент — отказ')
ok(!push({ payload: { ...base, club_id: U(98) } }).ok, 'клуб не клиента — отказ')
ok(!push({ client: null }).ok, 'клиент не найден — отказ')

// --- Причины паузы ---
const row = norm({}).data
const hold = (p) => homeworkAutoHoldReason({ row, client, health: null, sundayIso: SUN, ...p })
ok(hold({}) === null, 'всё в порядке — уходит')
ok(hold({ row: { ...row, enabled: false } }) === 'off', 'выключено — не уходит')
ok(hold({ client: { ...client, archived_at: '2026-10-01' } }) === 'archived', 'архив — не уходит')
ok(hold({ sundayIso: '2026-10-11' }) === 'not_started', 'до начала блока — не уходит')
ok(hold({ row: { ...row, skip_date: SUN } }) === 'skip', 'пропуск этого воскресенья')
ok(hold({ row: { ...row, skip_date: SUN }, sundayIso: '2026-10-25' }) === null, 'пропуск только одного воскресенья')
const sick = { contraindications: 'грыжа L5' }
ok(hold({ health: sick }) === 'limits', 'противопоказания в карточке без ограничений — не уходит само')
ok(hold({ health: { diseases: ['гипертония'] } }) === 'limits', 'болезни списком — тоже')
ok(hold({ health: sick, row: { ...row, avoid: ['back'] } }) === null, 'ограничения отмечены — уходит')
ok(hold({ health: sick, row: { ...row, limits_ok: true } }) === null, 'тренер подтвердил «ограничений нет» — уходит')
ok(hold({ health: { contraindications: '  ' } }) === null, 'пустые строки в карточке — не противопоказания')
ok(hold({ lastManualDay: '2026-10-16' }) === 'manual', 'тренер сам отправил в пятницу — автоматическое не уходит')
ok(hold({ lastManualDay: '2026-10-15' }) === 'manual', 'в четверг — тоже')
ok(hold({ lastManualDay: '2026-10-14' }) === null, 'в среду — это задание прошлой недели, автоматическое уходит')

// --- Предпросмотр = отправка ---
const now = new Date('2026-10-18T07:30:00Z')
const built = buildHomeworkAutoPlan({ row, client, sundayIso: SUN, now })
ok(built.ok && built.plan.id === homeworkAutoPlanId(C(1), SUN), 'задание с постоянным id воскресенья')
ok(built.plan.sent_by === TRAINER && built.plan.club_id === CLUB && built.plan.kind === 'homework', 'от имени тренера клиента, клуб клиента')
ok(normalizeClientPlanPushPayload(built.plan).ok, 'задание проходит белый список client_plans')
const preview = buildHomeworkAutoWeek(row, SUN)
ok(JSON.stringify(buildHomeworkAppSnapshot(preview.draft).payload) === JSON.stringify(built.plan.payload), 'тренер видит ровно то, что уйдёт')
ok(buildHomeworkAutoPlan({ row, client: { ...client, trainer_id: null }, sundayIso: SUN, now }).plan.sent_by === TRAINER, 'без тренера у клиента — от автора настроек')
const names = (day, r = row) => buildHomeworkAutoWeek(r, day).draft.blocks.flatMap((b) => b.exercises.map((e) => e.name)).join('|')
ok(names(SUN) === names('2026-11-08'), 'весь блок — те же упражнения')
ok(names(SUN) !== names('2026-11-15'), 'пятое воскресенье — другой набор, рассылка не останавливается')
ok(names(SUN) !== names(SUN, { ...row, block_shift: 1 }), '«другой набор» меняет упражнения')
const reps = (day) => buildHomeworkAutoWeek(row, day).draft.comment
ok(reps(SUN).includes('Неделя 1 из 4') && reps('2026-10-25').includes('Неделя 2 из 4'), 'неделя блока растёт каждое воскресенье')
ok(reps('2026-11-15').includes('Неделя 1 из 4'), 'новый набор снова с недели 1')
ok(buildHomeworkAutoWeek(row, SUN).draft.blocks[0].label.includes('Разминка'), 'занятие начинается с разминки')

// --- Cron на ВМ (поддельная база) ---
function fakeDb(tables) {
  const inserted = []
  const from = (table) => {
    const filters = []
    let lim = Infinity
    const q = {
      select: () => q,
      eq: (c, v) => (filters.push((r) => r[c] === v), q),
      in: (c, vs) => (filters.push((r) => vs.map(String).includes(String(r[c]))), q),
      gte: (c, v) => (filters.push((r) => String(r[c]) >= String(v)), q),
      gt: (c, v) => (filters.push((r) => String(r[c]) > String(v)), q),
      order: () => q,
      limit: (n) => ((lim = n), q),
      insert: async (r) => {
        const list = (tables[table] ??= [])
        if (list.some((x) => x.id === r.id)) return { error: { code: '23505', message: 'dup' } }
        list.push(r)
        inserted.push(r)
        return { error: null }
      },
      then: (res, rej) => Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, lim), error: null }).then(res, rej),
    }
    return q
  }
  return { from, inserted }
}

const rowFor = (n, patch = {}) => ({ ...base, id: homeworkAutoRowId(C(n)), client_id: C(n), ...patch })
const tables = {
  homework_auto: [
    rowFor(1),
    rowFor(2),
    rowFor(3),
    rowFor(4),
    rowFor(5, { enabled: false }),
    rowFor(6, { goal: 'magic' }),
  ],
  clients: [1, 2, 3, 4, 5, 6].map((n) => ({ id: C(n), trainer_id: TRAINER, club_id: CLUB, archived_at: n === 2 ? '2026-10-01' : null })),
  health_cards: [{ client_id: C(3), contraindications: 'грыжа', diseases: null }],
  client_plans: [{ id: U(90), client_id: C(4), kind: 'homework', sent_at: '2026-10-16T15:00:00Z' }],
}
const db = fakeDb(tables)
const notified = []
const notify = async (_db, plan) => notified.push(plan.id)
ok((await runHomeworkAutoSend({ db, now: new Date('2026-10-17T08:00:00Z'), notify })).skipped === 'not_sunday_window', 'в субботу cron молчит')
ok((await runHomeworkAutoSend({ db, now: new Date('2026-10-18T06:59:00Z'), notify })).skipped === 'not_sunday_window', 'в воскресенье до 10:00 — ещё рано')
ok((await runHomeworkAutoSend({ db, now: new Date('2026-10-18T19:00:00Z'), notify })).skipped === 'not_sunday_window', 'с 22:00 — уже поздно (тихие часы)')
const first = await runHomeworkAutoSend({ db, now, notify })
ok(first.sent === 1 && db.inserted.length === 1 && db.inserted[0].client_id === C(1), 'ушло одно задание — клиенту без причин паузы')
ok(first.held.archived === 1 && first.held.limits === 1 && first.held.manual === 1, 'архив, противопоказания и своё задание тренера — на паузе')
ok(first.failed === 1, 'битая строка настроек не роняет остальных')
ok(notified.length === 1 && notified[0] === db.inserted[0].id, 'клиенту push о задании')
ok(db.inserted[0].summary?.count > 0, 'плитка клиента получает число упражнений')
const second = await runHomeworkAutoSend({ db, now: new Date('2026-10-18T07:45:00Z'), notify })
ok(second.sent === 0 && second.already === 1 && db.inserted.length === 1 && notified.length === 1, 'повторный запуск cron не дублирует задание и push')

// --- Проводка таблицы ---
const tabletPushTables = readFileSync('src/lib/syncApiClient.js', 'utf8').match(/PUSH_TABLES = new Set\(\[([^\]]*)\]/)?.[1] ?? ''
const autoPushTables = readFileSync('src/lib/syncService.js', 'utf8').match(/AUTO_PUSH_TABLES = new Set\(\[([^\]]*)\]/)?.[1] ?? ''
ok(PUSH_ALLOWED_TABLES.has('homework_auto') && tabletPushTables.includes("'homework_auto'") && autoPushTables.includes("'homework_auto'"), 'homework_auto в allowlist push (сервер и планшет) и уходит сразу')
ok(PULL_MERGE_GUARD_STORES.has('homework_auto'), 'pull не затирает неотправленные настройки')
ok(SYNC_TABLE_PRIORITY.homework_auto > SYNC_TABLE_PRIORITY.clients, 'отправка после клиента (FK)')
ok(normalizeTrainerPullPayload({ homework_auto: [base] }).homework_auto.length === 1, 'trainer-pull: настройки доходят до планшета')
ok(/pullPerClientRows\('homework_auto'\)/.test(readFileSync('api/trainer-pull.js', 'utf8')), 'trainer-pull читает homework_auto')
ok(readFileSync('api/_lib/mutationAuth.js', 'utf8').includes('assertHomeworkAutoPush'), 'authorizePush проверяет права на настройки')
ok(readFileSync('scripts/client-reminders-vm.mjs', 'utf8').includes('runHomeworkAutoSend'), 'cron на ВМ запускает воскресную отправку')
const mig = 'supabase/migrations/20261023120000_homework_auto.sql'
ok(existsSync(mig) && /REVOKE ALL ON public\.homework_auto FROM anon/.test(readFileSync(mig, 'utf8')), 'миграция: таблица закрыта от прямого доступа')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll homework auto checks passed.')
