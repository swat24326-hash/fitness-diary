/**
 * Тренер: ПЗ + авто-закрытие ТЗ/АЗ в sync; ручное закрытие чужого зала — нет.
 * node scripts/verify-trainer-client-hall-lifecycle-push-auth.mjs
 */
import { AUTO_CLOSE_HALL_REASON } from '../src/lib/clientHallLifecycleCore.js'
import { assertTrainerClientHallLifecyclePush } from '../src/lib/trainer/trainerClientHallLifecyclePushAuthCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

ok(assertTrainerClientHallLifecyclePush({ operation: 'insert', hall: 'pz' }).ok, 'insert ПЗ')
ok(assertTrainerClientHallLifecyclePush({ operation: 'insert', hall: 'ПЗ' }).ok, 'insert ПЗ кириллица')
ok(
  assertTrainerClientHallLifecyclePush({
    operation: 'insert',
    hall: 'tz',
    close_reason: AUTO_CLOSE_HALL_REASON,
    closed_at: '2026-10-27T10:00:00.000Z',
  }).ok,
  'insert ТЗ авто-закрытие после close ПЗ',
)
ok(
  assertTrainerClientHallLifecyclePush({
    operation: 'insert',
    hall: 'az',
    close_reason: AUTO_CLOSE_HALL_REASON,
    closed_at: '2026-10-27T10:00:00.000Z',
  }).ok,
  'insert АЗ авто-закрытие',
)
ok(
  assertTrainerClientHallLifecyclePush({
    operation: 'insert',
    hall: 'tz',
    closed_at: null,
  }).ok,
  'insert ТЗ reopen после абона',
)

const manualTz = assertTrainerClientHallLifecyclePush({
  operation: 'insert',
  hall: 'tz',
  close_reason: 'Уехал',
  closed_at: '2026-10-27T10:00:00.000Z',
})
ok(
  !manualTz.ok && manualTz.error === 'Тренер может закрывать только направление ПЗ',
  'ручное закрытие ТЗ — отказ',
)

const unknown = assertTrainerClientHallLifecyclePush({ operation: 'insert', hall: 'xx' })
ok(!unknown.ok && unknown.error === 'Неизвестный зал', 'неизвестный зал')

ok(
  assertTrainerClientHallLifecyclePush({ operation: 'delete', hall: 'pz' }).ok,
  'delete ПЗ',
)
const delTz = assertTrainerClientHallLifecyclePush({ operation: 'delete', hall: 'tz' })
ok(
  !delTz.ok && delTz.error === 'Тренер может менять только направление ПЗ',
  'delete ТЗ — отказ',
)

if (failed) {
  console.error(`failed: ${failed}`)
  process.exit(1)
}
console.log('verify-trainer-client-hall-lifecycle-push-auth: ok')
