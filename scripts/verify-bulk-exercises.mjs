import { parseBulkExercises } from '../src/lib/parseBulkExercises.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const squat = `Название: Классический присед со штангой на спине
Направленность: Ноги / Ягодицы / Спина
Основные мышцы: Квадрицепсы, ягодичные, бицепс бедра, разгибатели спины
Примечание: Пять точек опоры; колени не выходят за носки; взгляд вперёд; в нижней точке угол в колене ≈90°.`

const r1 = parseBulkExercises(squat)
assert(r1.exercises.length === 1, 'labeled: one exercise')
assert(r1.exercises[0].name.includes('присед'), 'labeled: name')
assert(r1.exercises[0].muscle_group.includes('Ноги'), 'labeled: group')
assert(r1.exercises[0].primary_muscles.includes('Квадрицепсы'), 'labeled: muscles')
assert(r1.exercises[0].comment.includes('Пять точек'), 'labeled: comment with semicolons')
assert(r1.errors.length === 0, 'labeled: no errors')

const two = `${squat}

Название: Жим лёжа
Направленность: Грудь
Основные мышцы: Грудные, трицепс
Примечание: Лопатки сведены`

const r2 = parseBulkExercises(two)
assert(r2.exercises.length === 2, 'two blocks')

const pipe = 'Жим гантелей | Плечи | Дельты, трицепс | Стоя'
const r3 = parseBulkExercises(pipe)
assert(r3.exercises.length === 1, 'pipe line')
assert(r3.exercises[0].name === 'Жим гантелей', 'pipe name')

const badComma = 'Присед, Ноги, Квадрицепсы, ягодичные, бицепс, заметка'
const r4 = parseBulkExercises(badComma)
assert(r4.warnings.length > 0, 'comma line warns')
assert(r4.exercises[0].muscle_group === 'Ноги', 'comma splits naively')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll bulk-exercise parser checks passed.')
