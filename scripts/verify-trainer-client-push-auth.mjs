/**
 * Тренер отпускает своего клиента и не назначает чужого.
 * node scripts/verify-trainer-client-push-auth.mjs
 */
import { assertTrainerClientTrainerIdUpdate } from '../src/lib/trainer/trainerClientPushAuthCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const me = '33333333-3333-4333-8333-333333333333'
const other = '99999999-9999-4999-8999-999999999999'

ok(assertTrainerClientTrainerIdUpdate({ name: 'Иван' }, me).ok, 'без trainer_id — обычная правка')
ok(assertTrainerClientTrainerIdUpdate({ trainer_id: me, name: 'Иван' }, me).ok, 'свой id остаётся')
ok(assertTrainerClientTrainerIdUpdate({ trainer_id: null }, me).ok, 'null — отпустить своего')
ok(assertTrainerClientTrainerIdUpdate({ trainer_id: '' }, me).ok, 'пустая строка — отпустить своего')
ok(assertTrainerClientTrainerIdUpdate({ trainer_id: '  ' }, me).ok, 'пробелы — отпустить своего')

const foreign = assertTrainerClientTrainerIdUpdate({ trainer_id: other }, me)
ok(!foreign.ok && foreign.error === 'Нельзя переназначить клиента другому тренеру', 'чужого тренера не ставим')

if (failed) {
  console.error(`failed: ${failed}`)
  process.exit(1)
}
console.log('verify-trainer-client-push-auth: ok')
