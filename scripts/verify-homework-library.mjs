import {
  HOMEWORK_LIBRARY,
  filterHomeworkLibrary,
  homeworkDumbbellNote,
  homeworkEntryPhases,
  validateHomeworkLibraryAlts,
  validateHomeworkLibraryEntry,
} from '../src/lib/homework/library/homeworkLibrary.js'
import { HOMEWORK_AVOID, HOMEWORK_GOALS } from '../src/lib/homework/library/homeworkLibraryTags.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const lib = HOMEWORK_LIBRARY
const byId = new Map(lib.map((e) => [e.id, e]))
const ALL_AVOID = Object.keys(HOMEWORK_AVOID)

ok(lib.length >= 90, `в библиотеке не меньше 90 упражнений (${lib.length})`)

const badEntries = lib
  .map((e) => ({ id: e.id, errors: validateHomeworkLibraryEntry(e) }))
  .filter((r) => r.errors.length)
ok(!badEntries.length, `все записи корректны ${badEntries.map((r) => `${r.id}: ${r.errors.join('; ')}`).join(' | ')}`)

const altErrors = validateHomeworkLibraryAlts(lib)
ok(!altErrors.length, `замены гантелей корректны ${altErrors.join(' | ')}`)

ok(byId.size === lib.length, 'id уникальны')
const names = new Set(lib.map((e) => e.name.trim().toLowerCase().replace(/\s+/g, ' ')))
ok(names.size === lib.length, 'названия уникальны')

for (const goal of Object.keys(HOMEWORK_GOALS)) {
  const all = lib.filter((e) => e.goals.includes(goal)).length
  ok(all >= 15, `цель ${goal}: не меньше 15 упражнений (${all})`)
  const beginnerMain = filterHomeworkLibrary(lib, { goal, maxLevel: 1, phase: 'main' }).length
  ok(beginnerMain >= 6, `цель ${goal}: новичку в основную часть не меньше 6 (${beginnerMain})`)
}

const MAIN_PATTERNS = ['squat', 'lunge', 'hinge', 'glute', 'push', 'pull', 'core', 'cardio', 'mobility', 'stretch']
const beginner = { maxLevel: 1 }

for (const pattern of MAIN_PATTERNS) {
  ok(filterHomeworkLibrary(lib, { ...beginner, pattern }).length >= 2, `${pattern}: новичку дома не меньше 2 вариантов`)
  for (const a of ALL_AVOID) {
    const n = filterHomeworkLibrary(lib, { ...beginner, pattern, avoid: [a] }).length
    ok(n >= 2, `${pattern} при ограничении ${a}: не меньше 2 вариантов (${n})`)
  }
  const allAvoid = filterHomeworkLibrary(lib, { ...beginner, pattern, avoid: ALL_AVOID }).length
  ok(allAvoid >= 1, `${pattern} при всех ограничениях сразу: есть вариант (${allAvoid})`)
}

for (const phase of ['warmup', 'cooldown']) {
  for (const avoid of [[], ...ALL_AVOID.map((a) => [a]), ALL_AVOID]) {
    const n = filterHomeworkLibrary(lib, { ...beginner, phase, avoid }).length
    ok(n >= 4, `${phase} при ограничениях [${avoid.join(', ')}]: не меньше 4 вариантов (${n})`)
  }
}

ok(
  lib.every((e) => e.pattern !== 'stretch' || !homeworkEntryPhases(e).includes('warmup')),
  'растяжка не попадает в разминку',
)
ok(
  !filterHomeworkLibrary(lib, { goal: 'fat_loss', phase: 'main' }).some((e) => e.pattern === 'stretch'),
  'при похудении растяжки в основной части нет',
)
ok(
  lib.every((e) => !e.impact || !homeworkEntryPhases(e).includes('warmup')),
  'прыжки не попадают в разминку',
)
ok(!homeworkEntryPhases(byId.get('mob_breathing')).includes('warmup'), 'дыхание не в разминке (явная отметка)')
ok(homeworkEntryPhases(byId.get('cardio_march')).join() === 'warmup,main', 'марш — разминка и основная часть')

ok(!filterHomeworkLibrary(lib, {}).some((e) => e.impact), 'прыжки не попадают без allowImpact')
ok(filterHomeworkLibrary(lib, { allowImpact: true }).some((e) => e.impact), 'прыжки доступны с allowImpact')
ok(
  !filterHomeworkLibrary(lib, { equipment: [] }).some((e) => e.equip !== 'none'),
  'без инвентаря — только упражнения без инвентаря',
)
ok(
  filterHomeworkLibrary(lib, {}).some((e) => e.equip === 'band') &&
    filterHomeworkLibrary(lib, {}).some((e) => e.equip === 'dumbbells'),
  'по умолчанию резинка и гантели (с заменой) доступны',
)
ok(
  !filterHomeworkLibrary(lib, { avoid: ['knees'], allowImpact: true }).some((e) => e.avoid.includes('knees')),
  'ограничение «колени» отсекает упражнения с этой меткой',
)
ok(!filterHomeworkLibrary(lib, { maxLevel: 2 }).some((e) => e.level > 2), 'maxLevel отсекает сложные упражнения')

ok(
  homeworkDumbbellNote(byId.get('pull_db_row_single'), byId) ===
    'Нет гантелей? Возьмите бутылку 5 л или сумку с покупками или замените на «Тяга резинки к поясу».',
  'подсказка к гантелям: подручный предмет и упражнение-замена',
)
ok(homeworkDumbbellNote(byId.get('squat_bodyweight'), byId) === null, 'без гантелей подсказки нет')
ok(
  validateHomeworkLibraryEntry({ ...byId.get('squat_goblet'), household: '' }).length > 0,
  'гантели без домашней замены — ошибка',
)
ok(
  validateHomeworkLibraryAlts([...lib.filter((e) => e.id !== 'squat_goblet'), { ...byId.get('squat_goblet'), alt: 'push_wall' }]).length > 0,
  'замена другого типа движения — ошибка',
)
ok(validateHomeworkLibraryEntry({ ...lib[0], how: '' }).length > 0, 'упражнение без описания «как выполнять» — ошибка')
ok(
  validateHomeworkLibraryEntry({ ...lib[0], impact: true, level: 1 }).length > 0,
  'прыжок уровня 1 без avoid knees — ошибка',
)

if (failed) {
  console.error(`\nverify-homework-library: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-homework-library: OK')
