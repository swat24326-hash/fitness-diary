/**
 * node scripts/verify-health-screening.mjs
 * Анкета здоровья: ответы, итог (флаги допуска, ограничения), связь с авто-ДЗ, доступ и sync.
 */
import { readFileSync } from 'node:fs'
import {
  assertHealthScreeningPush,
  healthScreeningRowId,
  normalizeHealthScreeningRow,
  normalizeScreeningAnswers,
  screeningBlockAllNo,
  screeningHomeworkInputs,
  screeningHomeworkLine,
  screeningProgress,
  screeningSummary,
  screeningWithClearance,
} from '../src/lib/health/healthScreeningCore.js'
import { SCREEN_CLEARANCE, SCREEN_WOMEN } from '../src/lib/health/healthScreeningCatalog.js'
import { HEALTH_GOALS, composeHealthGoal, homeworkGoalFromHealthGoal, parseHealthGoal } from '../src/lib/health/healthGoalCore.js'
import { homeworkAutoDefaultsFromHealth } from '../src/lib/homework/auto/homeworkAutoDefaults.js'
import { HOMEWORK_GOAL_FORMULAS } from '../src/lib/homework/auto/homeworkGoalFormulas.js'
import { buildHomeworkAutoWeek, homeworkAutoHoldReason, homeworkAutoRowId } from '../src/lib/homework/auto/homeworkAutoScheduleCore.js'
import { generateHomeworkWeek } from '../src/lib/homework/auto/homeworkWeekGenerator.js'
import { HOMEWORK_LIBRARY } from '../src/lib/homework/library/homeworkLibrary.js'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { PULL_MERGE_GUARD_STORES } from '../src/lib/syncPullGuardCore.js'
import { SYNC_TABLE_PRIORITY } from '../src/lib/syncQueuePriorityCore.js'
import { normalizeTrainerPullPayload } from '../src/lib/trainerPullResponseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

const C = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLUB = C(900)
const TRAINER = C(500)
const SUN = '2026-10-18'

// --- Ответы ---
const raw = {
  clearance: { heart: { a: 'yes', d: ['arrhythmia', 'bogus'], note: '  стент   2024 ' }, dizzy: { a: 'no', d: ['x'] }, nope: { a: 'yes' }, lungs: { a: 'maybe' } },
  zones: { knee_l: { a: 'yes', s: 'sometimes', d: ['ligament'], t: ['squat', 'jump'] } },
  life: { experience: 'lt2y', home_days: '3', equipment: ['band', 'gold'], sleep: 'nope' },
}
const a = normalizeScreeningAnswers(raw)
ok(a.clearance.heart.d.join() === 'arrhythmia', 'уточнения — только из каталога')
ok(a.clearance.heart.note === 'стент 2024', '«что именно» — без лишних пробелов')
ok(a.clearance.dizzy.a === 'no' && !a.clearance.dizzy.d, '«нет» — без уточнений')
ok(!a.clearance.nope && !a.clearance.lungs, 'неизвестный вопрос и ответ «может быть» отброшены')
ok(!('breath' in a.clearance), 'незаданный вопрос ≠ «нет»: просто отсутствует')
ok(a.life.equipment.join() === 'band' && !a.life.sleep && a.life.home_days === '3', 'быт: только известные варианты')
ok(normalizeScreeningAnswers({ clearance: { heart: { a: 'yes', note: 'x'.repeat(500) } } }).clearance.heart.note.length === 200, 'длинная заметка обрезана до 200')

// --- Итог ---
const s = screeningSummary(a)
ok(s.answered && s.flags.includes('heart') && s.needsClearance, 'сердце «да» → нужен допуск')
ok(s.avoid.includes('pressure') && s.avoid.includes('knees'), 'сердце → беречь давление, колено → колени')
ok(s.noImpact, 'прыжки вызывают боль → без прыжков')
ok(s.level === 2 && s.sessions === 3, 'стаж 6 мес–2 года → уровень 2; 3 дня → 3 занятия')
ok(s.equipment.join() === 'none,band', 'дома: без инвентаря + резинка')
ok(s.pulseUnreliable, 'сердце → пульс не ориентир')
ok(s.badges.some((b) => b.tone === 'danger' && b.text.startsWith('Сердце: аритмия')), 'метка «Сердце: аритмия» — красная')
ok(s.badges.some((b) => b.tone === 'warning' && b.text.includes('Колено левое')), 'метка колена — жёлтая (не болит сейчас)')
ok(!screeningSummary(null).answered && !screeningSummary({}).needsClearance, 'пустая анкета — ничего не требует')

const past = screeningSummary({ zones: { lumbar: { a: 'yes', s: 'past' } } })
ok(!past.avoid.includes('back') && !past.needsClearance, 'старая травма без диагноза — поясницу не исключаем')
const hernia = screeningSummary({ zones: { lumbar: { a: 'yes', s: 'past', d: ['hernia'] } } })
ok(hernia.avoid.includes('back'), 'грыжа поясницы → беречь поясницу')
const acute = screeningSummary({ zones: { shoulder_r: { a: 'yes', s: 'now' } } })
ok(acute.needsClearance && acute.flags.includes('zone:shoulder_r'), 'болит сейчас → нужен допуск тренера')
ok(screeningSummary({ clearance: { pressure: { a: 'yes', d: ['low'] } } }).avoid.length === 0, 'пониженное давление — без исключения упражнений')
ok(screeningSummary({ clearance: { pressure: { a: 'yes', d: ['high'] } } }).avoid.includes('pressure'), 'повышенное давление → беречь давление')
const preg = screeningSummary({ women: { pregnancy: { a: 'yes' } } })
ok(preg.needsClearance && preg.noImpact, 'беременность → допуск и без прыжков (при любом поле в карточке)')
ok(screeningSummary({ bones: { osteoporosis: { a: 'yes' } } }).noImpact, 'остеопороз → без прыжков')

// --- Допуск ---
const cleared = screeningWithClearance(a, TRAINER, new Date('2026-10-14T10:00:00Z'))
ok(!screeningSummary(cleared).needsClearance && screeningSummary(cleared).cleared, 'тренер подтвердил допуск')
const moreFlags = normalizeScreeningAnswers({ ...cleared, clearance: { ...cleared.clearance, diabetes: { a: 'yes' } } })
ok(screeningSummary(moreFlags).needsClearance, 'новое «да» после подтверждения — подтверждать заново')
ok(normalizeScreeningAnswers({ cleared: { key: 'heart', by: 'not-uuid', at: 'x' } }).cleared === undefined, 'подтверждение без автора отброшено')

// --- «Остальное — нет» и прогресс ---
const allNo = screeningBlockAllNo(a, 'clearance')
ok(allNo.clearance.heart.a === 'yes' && allNo.clearance.breath.a === 'no', '«Остальное — нет» не трогает «да»')
ok(screeningProgress(allNo).clearance.done === SCREEN_CLEARANCE.length, 'блок допуска отвечен целиком')
ok(screeningProgress(a, 'male').women === null && screeningProgress(a, 'female').women.total === SCREEN_WOMEN.length, 'женский блок показываем только при поле «женский»')

// --- Строка для ДЗ ---
ok(/беречь: .*колени/.test(screeningHomeworkLine(s)) && /без прыжков/.test(screeningHomeworkLine(s)), 'подсказка для ДЗ перечисляет ограничения')
ok(screeningHomeworkLine(screeningSummary({})) === '', 'пустая анкета — без подсказки')

// --- Авто-ДЗ ---
const row = {
  id: homeworkAutoRowId(C(1)),
  client_id: C(1),
  club_id: CLUB,
  enabled: true,
  goal: 'tone',
  level: 3,
  avoid: ['wrists'],
  sessions: 2,
  sex: 'female',
  limits_ok: false,
  anchor_date: SUN,
  block_shift: 0,
  skip_date: null,
  updated_by: TRAINER,
}
const inputs = screeningHomeworkInputs(row, a)
ok(inputs.level === 1, 'допуск в анкете → щадящая нагрузка (новичок)')
ok(['wrists', 'knees', 'pressure'].every((x) => inputs.avoid.includes(x)), 'ограничения анкеты складываются с выбранными тренером')
ok(inputs.noImpact === true && inputs.equipment.join() === 'none,band', 'без прыжков и только домашний инвентарь')
ok(screeningHomeworkInputs(row, null).level === 3 && screeningHomeworkInputs(row, {}).level === 3, 'без анкеты — настройки тренера как есть')

const client = { id: C(1), trainer_id: TRAINER, club_id: CLUB, archived_at: null }
const hold = (screening, health = null, r = row) => homeworkAutoHoldReason({ row: r, client, health, screening, sundayIso: SUN })
ok(hold(a) === 'clearance', 'флаг допуска → авто-ДЗ ждёт подтверждения')
ok(hold(cleared) === null, 'допуск подтверждён → уходит')
ok(hold(normalizeScreeningAnswers({ clearance: { heart: { a: 'no' } } }), { contraindications: 'Грыжа L5' }) === null, 'анкета без флагов решает вместо текста противопоказаний')
ok(hold(null, { contraindications: 'Грыжа L5' }, { ...row, avoid: [] }) === 'limits', 'без анкеты — старое правило по тексту карточки')

const week = buildHomeworkAutoWeek(row, SUN, cleared)
ok(week.ok, 'неделя собирается с ограничениями анкеты')
const libById = new Map(HOMEWORK_LIBRARY.map((e) => [e.id, e]))
const entriesOf = (draft) => draft.blocks.flatMap((b) => b.exercises).map((ex) => libById.get(ex.library_id)).filter(Boolean)
const picked = week.ok ? entriesOf(week.draft) : []
ok(picked.length > 0, 'упражнения недели найдены в библиотеке')
ok(picked.every((e) => !e.avoid.some((x) => ['knees', 'pressure', 'wrists'].includes(x))), 'в неделе нет упражнений на колени / давление / запястья')
ok(picked.every((e) => !e.impact), 'в неделе нет прыжков')
ok(picked.every((e) => ['none', 'band'].includes(e.equip)), 'только то, что есть дома')

const withJumps = generateHomeworkWeek({ goal: 'fat_loss', level: 3, seed: 'x' })
const noJump = generateHomeworkWeek({ goal: 'fat_loss', level: 3, noImpact: true, seed: 'x' })
ok(withJumps.ok && entriesOf(withJumps.draft).some((e) => e.impact), 'генератор: продвинутому похудению обычно дают прыжки')
ok(noJump.ok && entriesOf(noJump.draft).every((e) => !e.impact), 'генератор: noImpact убирает прыжки и на продвинутом уровне')

// --- Строка и доступ ---
const id = healthScreeningRowId(C(1))
const base = { id, client_id: C(1), club_id: CLUB, answers: raw, updated_by: TRAINER, updated_at: '2026-10-14T10:00:00Z' }
const norm = normalizeHealthScreeningRow(base)
ok(norm.ok && norm.data.answers.clearance.heart.d.join() === 'arrhythmia', 'строка: ответы нормализованы перед записью')
ok(!normalizeHealthScreeningRow({ ...base, id: C(77) }).ok, 'строка: id не от этого клиента — отказ')
ok(healthScreeningRowId(C(1)) === id && healthScreeningRowId(C(2)) !== id, 'id постоянный от клиента')
const push = (over = {}) =>
  assertHealthScreeningPush({ op: 'update', isTrainer: true, userId: TRAINER, payload: base, remoteId: id, client, ...over })
ok(push().ok, 'тренер клиента пишет анкету')
ok(!push({ userId: C(501), payload: { ...base, updated_by: C(501) } }).ok, 'чужой тренер — отказ')
ok(push({ isTrainer: false, isAdmin: true, userId: C(501), payload: { ...base, updated_by: C(501) } }).ok, 'админ может')
ok(!push({ op: 'delete' }).ok, 'удалять анкету нельзя')
ok(!push({ client: { ...client, archived_at: '2026-01-01' } }).ok, 'архивный клиент — отказ')
ok(!push({ payload: { ...base, club_id: C(901) } }).ok, 'чужой клуб — отказ')
ok(!push({ isTrainer: false }).ok, 'без роли тренера / админа — отказ')

// --- Sync ---
ok(PUSH_ALLOWED_TABLES.has('health_screenings'), 'push-record принимает health_screenings')
ok(PULL_MERGE_GUARD_STORES.has('health_screenings'), 'pull не затирает неотправленную анкету')
ok(SYNC_TABLE_PRIORITY.health_screenings > SYNC_TABLE_PRIORITY.clients, 'анкета уходит после клиента')
ok(normalizeTrainerPullPayload({ health_screenings: [{ id }] }).health_screenings.length === 1, 'trainer-pull: анкеты доходят до планшета')
ok(/pullPerClientRows\('health_screenings'\)/.test(readFileSync('api/trainer-pull.js', 'utf8')), 'trainer-pull читает health_screenings')
const job = readFileSync('api/_lib/homeworkAuto/homeworkAutoJob.js', 'utf8')
ok(/health_screenings/.test(job) && /screening/.test(job), 'cron авто-ДЗ читает анкету')
const mig = readFileSync('supabase/migrations/20261024120000_health_screenings.sql', 'utf8')
ok(/ENABLE ROW LEVEL SECURITY/.test(mig) && /REVOKE ALL ON public\.health_screenings FROM authenticated/.test(mig), 'миграция: таблица закрыта от прямого доступа')

// --- Цель клиента: стандартная + уточнение ---
ok(composeHealthGoal('fat_loss', 'минус 10 кг') === 'Снижение веса — минус 10 кг', 'цель: «Снижение веса — минус 10 кг»')
ok(composeHealthGoal('back', '') === 'Здоровая спина', 'цель без уточнения — только название')
ok(composeHealthGoal(null, '  ') === null, 'пустая цель → null')
ok(composeHealthGoal(null, 'хочет на марафон') === 'хочет на марафон', 'без выбора — свой текст')
const g1 = parseHealthGoal('Снижение веса — минус 10 кг')
ok(g1.id === 'fat_loss' && g1.detail === 'минус 10 кг', 'разбор: цель и уточнение')
ok(parseHealthGoal('снижение веса').id === 'fat_loss', 'разбор: регистр не важен')
const legacy = parseHealthGoal('Похудеть к лету, болит спина')
ok(legacy.id === null && legacy.detail === 'Похудеть к лету, болит спина', 'старый свободный текст — не теряется, цель не угадывается')
ok(parseHealthGoal('Выносливостьбег').id === null, 'название без разделителя — не цель')
ok(composeHealthGoal('fat_loss', 'минус ') === 'Снижение веса — минус ' && parseHealthGoal('Снижение веса — минус ').detail === 'минус ', 'пробел при наборе не съедается')
for (const g of HEALTH_GOALS) {
  ok(parseHealthGoal(composeHealthGoal(g.id, 'x')).id === g.id, `туда-обратно: ${g.label}`)
  ok(HOMEWORK_GOAL_FORMULAS[g.homework], `${g.label} → есть формула авто-ДЗ «${g.homework}»`)
}
ok(homeworkGoalFromHealthGoal('Здоровая спина — сидячая работа') === 'posture', 'спина → ДЗ на осанку')
ok(homeworkAutoDefaultsFromHealth({ goal: 'Выносливость', nutrition_survey: { goalKind: 'lose_weight' } }).goal === 'endurance', 'авто-ДЗ: цель карты важнее опросника питания')
ok(homeworkAutoDefaultsFromHealth({ goal: 'Похудеть', nutrition_survey: { goalKind: 'lose_weight' } }).goal === 'fat_loss', 'авто-ДЗ: старая цель текстом — как раньше, из питания')

if (failed) {
  console.error(`\n${failed} health screening check(s) failed`)
  process.exit(1)
}
console.log('\nAll health screening checks passed.')
