/**
 * Защита от дублей при создании клиента тренером (node scripts/verify-trainer-client-create-guard.mjs).
 */
import {
  findClientsWithSameFormattedName,
  sameNameCreateConfirmMessageRu,
  shouldSkipDuplicateClientCreateClick,
} from '../src/lib/trainer/trainerClientCreateGuardCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log('ok:', msg)
  else {
    console.error('FAIL:', msg)
    failed++
  }
}

ok(shouldSkipDuplicateClientCreateClick(true), 'second create click while in flight')
ok(!shouldSkipDuplicateClientCreateClick(false), 'first create click proceeds')
ok(!shouldSkipDuplicateClientCreateClick(undefined), 'undefined inFlight proceeds')

const pool = [
  { id: '1', name: 'Черненок Галина Владимировна' },
  { id: '2', name: 'Иванов Иван' },
  { id: '3', name: 'черненок галина владимировна' },
]
const same = findClientsWithSameFormattedName(pool, 'Черненок Галина Владимировна')
ok(same.length === 2, 'same FIO found ignoring case/format')
ok(findClientsWithSameFormattedName(pool, 'Петров Пётр').length === 0, 'other name empty')
ok(findClientsWithSameFormattedName([], 'А').length === 0, 'empty pool')
ok(findClientsWithSameFormattedName(pool, '   ').length === 0, 'blank name')

const msg1 = sameNameCreateConfirmMessageRu('Черненок Галина Владимировна', 1)
ok(msg1.includes('Черненок'), 'confirm mentions name')
ok(msg1.includes('уже есть карточка') || msg1.includes('Уже есть карточка'), 'confirm single')
const msg2 = sameNameCreateConfirmMessageRu('Черненок Галина Владимировна', 2)
ok(msg2.includes('2'), 'confirm count')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
