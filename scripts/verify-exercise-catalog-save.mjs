/**
 * Админ: создание/правка упражнения не ждёт облако (INC-2026-09-24-04).
 * node scripts/verify-exercise-catalog-save.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldAwaitExerciseCloudAck } from '../src/lib/exerciseMutationCore.js'
import { shouldDropExhaustedSyncRetry } from '../src/lib/syncFlushResult.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

ok(!shouldAwaitExerciseCloudAck('insert'), 'insert не ждёт облако')
ok(!shouldAwaitExerciseCloudAck('update'), 'update не ждёт облако')
ok(shouldAwaitExerciseCloudAck('delete'), 'delete ждёт облако')

ok(
  !shouldDropExhaustedSyncRetry({ table_name: 'exercises', operation: 'insert', retry_count: 12 }),
  '12 таймаутов: упражнение в очереди',
)

const svc = read('src/lib/exerciseService.js')
ok(svc.includes("saveLocalWithSync('exercises'"), 'insert/update пишут очередь')
ok(!/return pushExerciseOp/.test(svc), 'нет второго await push после save')
ok(/pushRecordViaApi/.test(svc), 'delete всё ещё через push-record')

const page = read('src/pages/admin/AdminExercises.jsx')
ok(/insertExercise\(row\)/.test(page), 'форма добавляет через сервис')
ok(/updateExercise\(row\)/.test(page), 'форма правит через сервис')

if (failed) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log('\nverify-exercise-catalog-save: all passed')
