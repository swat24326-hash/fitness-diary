import { generateHomeworkWeek } from '../src/lib/homework/auto/homeworkWeekGenerator.js'
import { homeworkMainDose } from '../src/lib/homework/auto/homeworkGoalFormulas.js'
import { homeworkAutoDefaultsFromHealth } from '../src/lib/homework/auto/homeworkAutoDefaults.js'
import { HOMEWORK_LIBRARY } from '../src/lib/homework/library/homeworkLibrary.js'
import { HOMEWORK_AVOID, HOMEWORK_GOALS } from '../src/lib/homework/library/homeworkLibraryTags.js'
import { buildHomeworkAppSnapshot } from '../src/lib/homework/homeworkAppSendCore.js'
import { normalizeHomeworkExerciseItem } from '../src/lib/homework/homeworkPresetsCore.js'
import { CLIENT_PLAN_MAX_BYTES, sanitizeClientPlanPayload } from '../src/lib/clientPlans/clientPlanCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const byId = new Map(HOMEWORK_LIBRARY.map((e) => [e.id, e]))
const items = (draft) => draft.blocks.flatMap((b) => b.exercises)
const mainItems = (draft) => draft.blocks.filter((b) => !/Разминка|Заминка/.test(b.label)).flatMap((b) => b.exercises)
const ALL_AVOID = Object.keys(HOMEWORK_AVOID)

ok(generateHomeworkWeek({ goal: 'nope' }).error === 'unknown_goal', 'неизвестная цель — ошибка')

let allOk = true
let structureOk = true
let avoidOk = true
let impactOk = true
let limitsOk = true
let warmCardioFirst = true
const avoidSets = [[], ...ALL_AVOID.map((a) => [a]), ALL_AVOID]
for (const goal of Object.keys(HOMEWORK_GOALS)) {
  for (const level of [1, 2, 3]) {
    for (const sessions of [2, 3]) {
      for (const avoid of avoidSets) {
        const res = generateHomeworkWeek({ goal, level, sessions, avoid, seed: 'c1', sex: 'female' })
        if (!res.ok) {
          allOk = false
          console.error(`  нет недели: ${goal} ур.${level} ${sessions} [${avoid}]`)
          continue
        }
        const d = res.draft
        const keys = ['А', 'Б', 'В'].slice(0, sessions)
        const expected = keys.flatMap((k) => [`Занятие ${k} · Разминка`, `Занятие ${k} · `, `Занятие ${k} · Заминка`])
        if (d.blocks.length !== expected.length || d.blocks.some((b, i) => !b.label.startsWith(expected[i]))) {
          structureOk = false
          console.error(`  строение: ${goal} ур.${level} ${sessions} [${avoid}] → ${d.blocks.map((b) => b.label).join(' | ')}`)
        }
        for (const it of items(d)) {
          const e = byId.get(it.library_id)
          if (!e || e.avoid.some((a) => avoid.includes(a)) || e.level > level) avoidOk = false
          if (e?.impact && level < 2) impactOk = false
          if (it.reps.length > 20 || !it.how) limitsOk = false
        }
        for (const b of d.blocks) {
          if (/Разминка/.test(b.label) && b.exercises.some((it) => byId.get(it.library_id)?.impact)) impactOk = false
          if (/Разминка/.test(b.label) && byId.get(b.exercises[0]?.library_id)?.pattern !== 'cardio') warmCardioFirst = false
          if (b.label.length > 60) limitsOk = false
        }
        if (d.comment.length > 500) limitsOk = false
      }
    }
  }
}
ok(allOk, 'неделя собирается для каждой цели, уровня, числа занятий и ограничений')
ok(structureOk, 'каждое занятие: разминка → основная часть → заминка')
ok(avoidOk, 'ограничения клиента и уровень соблюдаются во всех упражнениях')
ok(impactOk, 'прыжков нет у новичков и в разминке')
ok(warmCardioFirst, 'разминка начинается с лёгкого кардио')
ok(limitsOk, 'нормы, подписи блоков и комментарий укладываются в лимиты снимка клиента; у всех есть «как выполнять»')

const base = { goal: 'tone', level: 2, sessions: 3, seed: 'client-42' }
const w1 = generateHomeworkWeek({ ...base, week: 1 }).draft
const w1b = generateHomeworkWeek({ ...base, week: 1 }).draft
const w2 = generateHomeworkWeek({ ...base, week: 2 }).draft
const w4 = generateHomeworkWeek({ ...base, week: 4 }).draft
const other = generateHomeworkWeek({ ...base, week: 1, variant: 1 }).draft
const names = (d) => items(d).map((i) => i.name).join('|')
ok(JSON.stringify(w1) === JSON.stringify(w1b), 'одинаковые настройки — одинаковая неделя')
ok(names(w1) === names(w2) && names(w1) === names(w4), 'внутри блока упражнения те же (меняется только нагрузка)')
ok(JSON.stringify(mainItems(w1).map((i) => i.reps)) !== JSON.stringify(mainItems(w2).map((i) => i.reps)), 'неделя 2 тяжелее недели 1')
ok(names(mainItems(other).length ? other : w1) !== names(w1), '«Другой набор» меняет упражнения')
const mainIds = mainItems(w1).map((i) => i.library_id)
ok(new Set(mainIds).size === mainIds.length, 'основная часть недели без повторов упражнений')

const d1 = homeworkMainDose('tone', 1, 1, 'reps')
const d3 = homeworkMainDose('tone', 1, 3, 'reps')
const d4 = homeworkMainDose('tone', 1, 4, 'reps')
ok(d3.amount > d1.amount && d3.sets === d1.sets, 'недели 1–3: растут повторы, подходы те же')
ok(d4.sets === d1.sets + 1 && d4.amount === d3.amount, 'неделя 4: плюс подход при нагрузке 3-й недели')
const c1 = homeworkMainDose('fat_loss', 1, 1, 'reps')
ok(c1.unit === 'sec' && c1.sets === 3, 'круговая: работа на время, 3 круга у новичка')

const neutral = generateHomeworkWeek({ goal: 'tone', level: 1, seed: 'x' }).draft
const female = generateHomeworkWeek({ goal: 'tone', level: 1, seed: 'x', sex: 'female' }).draft
ok(mainItems(female).length === mainItems(neutral).length + 2, 'акцент по полу добавляет по упражнению в каждое занятие')
const femaleExtra = byId.get(female.blocks[1].exercises.at(-1).library_id)
ok(femaleExtra?.pattern === 'glute', 'женщине добавочное упражнение — на ягодицы')

const withDb = Array.from({ length: 30 }, (_, v) => generateHomeworkWeek({ ...base, variant: v }).draft)
  .flatMap(items)
  .find((it) => byId.get(it.library_id)?.equip === 'dumbbells')
ok(Boolean(withDb && withDb.tip.includes('Нет гантелей?')), 'у упражнения с гантелями — подсказка, чем заменить')

const snap = buildHomeworkAppSnapshot(w1)
ok(snap.ok && snap.payload.blocks[0].exercises[0].how, 'снимок для приложения сохраняет «как выполнять»')
ok(snap.ok && snap.payload.blocks.length === 9, 'в снимке все 9 блоков трёх занятий')
ok(snap.ok && JSON.stringify(snap.payload).length < CLIENT_PLAN_MAX_BYTES, 'снимок недели укладывается в лимит размера')
ok(snap.ok && !JSON.stringify(snap.payload).includes('library_id'), 'id библиотеки клиенту не уходит')
const plain = sanitizeClientPlanPayload('homework', { blocks: [{ label: 'Основное', exercises: [{ name: 'Присед', sets: 2, reps: '10' }] }] })
ok(!('how' in plain.blocks[0].exercises[0]), 'у ручного ДЗ без описаний лишних полей нет')

const kept = normalizeHomeworkExerciseItem({ name: 'Планка', sets: 2, reps: '30 сек', how: 'Упритесь', tip: 'Ровно' })
ok(kept.how === 'Упритесь' && kept.tip === 'Ровно', 'правка черновика не теряет описания')

ok(homeworkAutoDefaultsFromHealth({ nutrition_survey: { goalKind: 'lose_weight' }, sex: 'female' }).goal === 'fat_loss', 'цель «снижение веса» из питания → похудение')
ok(homeworkAutoDefaultsFromHealth({ nutrition_survey: { goalKind: 'gain_mass' } }).goal === 'tone', 'цель «набор массы» → набор / тонус')
ok(homeworkAutoDefaultsFromHealth(null).goal === 'general', 'без опросника — ОФП')
ok(homeworkAutoDefaultsFromHealth({ sex: 'male' }).sex === 'male', 'пол берётся из карточки')

if (failed) {
  console.error(`\nverify-homework-generator: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-homework-generator: OK')
