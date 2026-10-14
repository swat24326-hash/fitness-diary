/**
 * node scripts/verify-homework-library-overrides.mjs
 * Библиотека ДЗ, которую правит админ: слияние со встроенной, статусы, форма, права push, sync, cron.
 */
import { existsSync, readFileSync } from 'node:fs'
import { HOMEWORK_LIBRARY, validateHomeworkLibraryEntry } from '../src/lib/homework/library/homeworkLibrary.js'
import {
  assertHomeworkLibraryPush,
  baseHomeworkEntry,
  homeworkLibraryAdminList,
  homeworkLibraryAltOptions,
  mergeHomeworkLibrary,
  newHomeworkLibraryId,
  normalizeHomeworkLibraryRow,
} from '../src/lib/homework/library/homeworkLibraryOverridesCore.js'
import {
  emptyHomeworkLibraryForm,
  homeworkEntryFromForm,
  homeworkLibraryFormErrors,
  homeworkLibraryFormFromEntry,
} from '../src/lib/homework/library/homeworkLibraryFormCore.js'
import { generateHomeworkWeek } from '../src/lib/homework/auto/homeworkWeekGenerator.js'
import { buildHomeworkAutoWeek } from '../src/lib/homework/auto/homeworkAutoScheduleCore.js'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { loadHomeworkLibraryRows } from '../api/_lib/homeworkLibrary/homeworkLibraryRows.js'
import { PULL_MERGE_GUARD_STORES } from '../src/lib/syncPullGuardCore.js'
import { SYNC_TABLE_PRIORITY } from '../src/lib/syncQueuePriorityCore.js'
import { normalizeTrainerPullPayload } from '../src/lib/trainerPullResponseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`OK ${msg}`)
  else {
    console.error(`FAIL ${msg}`)
    failed++
  }
}

const ADMIN = '11111111-1111-4111-8111-111111111111'
const base = HOMEWORK_LIBRARY[0]
const row = (entry, extra = {}) => ({ id: entry.id, entry, is_active: true, updated_by: ADMIN, ...extra })
const custom = {
  id: 'c_test0001',
  name: 'Подъём таза у стены',
  pattern: 'glute',
  level: 1,
  equip: 'none',
  unit: 'reps',
  avoid: [],
  goals: ['tone', 'general'],
  focus: 'lower',
  how: 'Лёжа на спине, стопы на стене. Поднимите таз и опустите.',
  cue: 'Не прогибайте поясницу',
}

// --- Слияние ---
ok(mergeHomeworkLibrary([]).length === HOMEWORK_LIBRARY.length, 'без правок — встроенная библиотека')
const renamed = { ...base, name: 'Новое имя' }
const merged = mergeHomeworkLibrary([row(renamed), row(custom), row(HOMEWORK_LIBRARY[1], { is_active: false })])
ok(merged.find((e) => e.id === base.id)?.name === 'Новое имя', 'правка встроенного заменяет его')
ok(merged.some((e) => e.id === custom.id), 'своё упражнение добавляется')
ok(!merged.some((e) => e.id === HOMEWORK_LIBRARY[1].id), 'убранное не попадает в подбор')
ok(merged.length === HOMEWORK_LIBRARY.length, 'итог: +1 своё, −1 убранное')
ok(mergeHomeworkLibrary([{ id: 'BAD ID', entry: {} }, row({ ...custom, how: '' })]).length === HOMEWORK_LIBRARY.length, 'битые строки пропускаются, генератор не падает')
// --- Список админа ---
const list = homeworkLibraryAdminList([row(renamed), row(custom), row(HOMEWORK_LIBRARY[1], { is_active: false })])
const st = (id) => list.find((x) => x.entry.id === id)?.status
ok(st(base.id) === 'edited' && st(custom.id) === 'custom' && st(HOMEWORK_LIBRARY[1].id) === 'removed' && st(HOMEWORK_LIBRARY[2].id) === 'base', 'статусы: изменено / своё / убрано / как в коде')
ok(list.length === HOMEWORK_LIBRARY.length + 1, 'админ видит и убранные')
ok(homeworkLibraryAdminList([row(baseHomeworkEntry(base.id))]).find((x) => x.entry.id === base.id)?.status === 'base', '«Вернуть как было» — снова без пометки')
const removedOf = (entry) => homeworkLibraryAdminList([{ id: HOMEWORK_LIBRARY[1].id, entry, is_active: false }]).find((x) => x.entry.id === HOMEWORK_LIBRARY[1].id)?.entry.name
ok(removedOf({ ...HOMEWORK_LIBRARY[1], name: 'Переименовано' }) === 'Переименовано', 'убранное показывается в последней версии — его можно найти и вернуть')
ok(removedOf({}) === HOMEWORK_LIBRARY[1].name, 'убранное без данных — с исходным названием')

// --- Нормализация строки ---
ok(normalizeHomeworkLibraryRow(row(custom)).ok, 'корректное упражнение проходит')
ok(!normalizeHomeworkLibraryRow(row({ ...custom, goals: [] })).ok, 'без цели — отказ')
ok(!normalizeHomeworkLibraryRow({ id: 'x y', entry: custom }).ok, 'кривой id — отказ')
ok(normalizeHomeworkLibraryRow({ id: custom.id, entry: { ...custom, how: '' }, is_active: false }).ok, 'убрать можно даже неполное')
ok(normalizeHomeworkLibraryRow(row({ ...custom, junk: 1 })).data.entry.junk === undefined, 'лишние поля не сохраняются')
ok(/^c_[a-z0-9]{8}$/.test(newHomeworkLibraryId()), 'id своего упражнения: c_ + 8 символов')

// --- Права на запись ---
const payload = { id: custom.id, updated_by: ADMIN }
ok(assertHomeworkLibraryPush({ op: 'insert', isAdmin: true, userId: ADMIN, payload, remoteId: null }).ok, 'админ добавляет')
ok(!assertHomeworkLibraryPush({ op: 'update', isAdmin: false, userId: ADMIN, payload, remoteId: custom.id }).ok, 'тренер не меняет библиотеку')
ok(!assertHomeworkLibraryPush({ op: 'delete', isAdmin: true, userId: ADMIN, payload, remoteId: custom.id }).ok, 'удаление запрещено — только «убрать из подбора»')
ok(!assertHomeworkLibraryPush({ op: 'update', isAdmin: true, userId: ADMIN, payload, remoteId: 'other' }).ok, 'id строки и записи совпадают')
ok(!assertHomeworkLibraryPush({ op: 'update', isAdmin: true, userId: ADMIN, payload: { ...payload, updated_by: 'x' }, remoteId: custom.id }).ok, 'правка только от своего имени')

// --- Форма ---
const blank = emptyHomeworkLibraryForm('c_new00001')
const blankErr = homeworkLibraryFormErrors(blank, HOMEWORK_LIBRARY)
ok(blankErr.name && blankErr.goals && blankErr.how && blankErr.cue, 'пустая форма — ошибки у названия, целей, описания, ошибки техники')
for (const e of HOMEWORK_LIBRARY) {
  const form = homeworkLibraryFormFromEntry(e)
  const errs = homeworkLibraryFormErrors(form, HOMEWORK_LIBRARY)
  if (Object.keys(errs).length) ok(false, `форма встроенного ${e.id} без ошибок: ${JSON.stringify(errs)}`)
  const back = homeworkEntryFromForm(form)
  if (validateHomeworkLibraryEntry(back).length || JSON.stringify(back.phases) !== JSON.stringify(e.phases)) {
    ok(false, `форма → упражнение ${e.id} без потерь`)
  }
}
ok(true, 'все встроенные упражнения открываются в форме и сохраняются без потерь')
const dumb = HOMEWORK_LIBRARY.find((e) => e.equip === 'dumbbells')
const toNone = homeworkEntryFromForm({ ...homeworkLibraryFormFromEntry(dumb), equip: 'none' })
ok(toNone.household === undefined && toNone.alt === undefined && !validateHomeworkLibraryEntry(toNone).length, 'без гантелей замена не сохраняется')
ok(homeworkLibraryFormErrors({ ...homeworkLibraryFormFromEntry(dumb), alt: '' }, HOMEWORK_LIBRARY).alt, 'у гантелей нужна замена')
ok(homeworkLibraryAltOptions(HOMEWORK_LIBRARY, dumb.pattern, dumb.avoid).every((x) => x.equip !== 'dumbbells' && x.pattern === dumb.pattern), 'замены: то же движение, без гантелей')
ok(homeworkLibraryFormErrors({ ...homeworkLibraryFormFromEntry(custom), impact: true }, HOMEWORK_LIBRARY).impact, 'прыжки на уровне 1 — ошибка')

// --- Генератор берёт итоговую библиотеку ---
const used = (lib) => JSON.stringify(generateHomeworkWeek({ library: lib, goal: 'general', level: 2, sessions: 3, week: 1, seed: 'x' }).draft)
const firstId = used(HOMEWORK_LIBRARY).match(/"library_id":"([a-z0-9_]+)"/)?.[1]
ok(Boolean(firstId), 'генератор помечает упражнения id библиотеки')
const without = mergeHomeworkLibrary([row(baseHomeworkEntry(firstId), { is_active: false })])
ok(!used(without).includes(`"library_id":"${firstId}"`), 'убранное упражнение не попадает в ДЗ')
const autoRow = { id: 'r', client_id: 'c', enabled: true, goal: 'general', level: 2, avoid: [], sessions: 3, sex: null, block_shift: 0, anchor_date: '2026-10-18' }
const autoWeek = buildHomeworkAutoWeek(autoRow, '2026-10-18', null, without)
ok(autoWeek.ok && !JSON.stringify(autoWeek.draft).includes(`"library_id":"${firstId}"`), 'воскресное авто-ДЗ тоже без убранного')

// --- Сервер и sync ---
const fakeDb = (error, data = []) => ({ from: () => ({ select: () => ({ order: async () => ({ data, error }) }) }) })
ok((await loadHomeworkLibraryRows(fakeDb({ code: '42P01' }))).length === 0, 'таблицы ещё нет — встроенная библиотека, cron не падает')
let threw = false
try {
  await loadHomeworkLibraryRows(fakeDb({ code: '500', message: 'down' }))
} catch {
  threw = true
}
ok(threw, 'другая ошибка базы не маскируется')
ok(PUSH_ALLOWED_TABLES.has('homework_library'), 'push: таблица в allowlist сервера')
const src = (p) => readFileSync(p, 'utf8')
ok(/PUSH_TABLES = new Set\(\[[^\]]*'homework_library'/.test(src('src/lib/syncApiClient.js')), 'push: таблица в allowlist планшета')
ok(/AUTO_PUSH_TABLES = new Set\(\[[^\]]*'homework_library'/.test(src('src/lib/syncService.js')), 'правка уходит сразу')
ok(PULL_MERGE_GUARD_STORES.has('homework_library'), 'pull не затирает неотправленную правку')
ok(Number.isFinite(SYNC_TABLE_PRIORITY.homework_library), 'приоритет в очереди задан')
ok(normalizeTrainerPullPayload({ homework_library: [row(custom)] }).homework_library.length === 1, 'trainer-pull доносит правки до планшета')
ok(src('api/trainer-pull.js').includes('loadHomeworkLibraryRows'), 'trainer-pull читает таблицу')
ok(src('api/_lib/mutationAuth.js').includes('assertHomeworkLibraryPush'), 'authorizePush проверяет права')
ok(/mergeHomeworkLibrary\(await loadHomeworkLibraryRows/.test(src('api/_lib/homeworkAuto/homeworkAutoJob.js')), 'cron собирает ДЗ по итоговой библиотеке')
ok(src('src/lib/localDb.js').includes("createObjectStore('homework_library'"), 'IndexedDB: хранилище правок')
ok(src('api/admin-data.js').includes("'homework-library'"), 'admin-data отдаёт правки')
const mig = 'supabase/migrations/20261025120000_homework_library.sql'
ok(existsSync(mig) && /ENABLE ROW LEVEL SECURITY/.test(src(mig)) && /REVOKE ALL ON public\.homework_library FROM anon/.test(src(mig)), 'миграция: RLS и закрыто от прямого доступа')

if (failed) {
  console.error(`\n${failed} проверок не прошли`)
  process.exit(1)
}
console.log('\nverify-homework-library-overrides: OK')
