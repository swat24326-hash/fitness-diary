/**
 * node scripts/verify-sales-payments-link.mjs
 */
import {
  buildPaymentClientLinkActions,
  collapsePaymentLinesByCardLastWins,
  inferPackageMonthsFromTariff,
  matchAzDirectionFromTariff,
  resolvePzLinkMode,
  validatePaymentLinkAction,
} from '../src/lib/admin/salesPaymentsLinkCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(inferPackageMonthsFromTariff('12/1 Elite утро') === 1, 'months from 12/1')
ok(inferPackageMonthsFromTariff('8/1 Diamond') === 1, 'months from 8/1')
ok(inferPackageMonthsFromTariff('абонемент 3 мес') === 3, 'months from мес')

const azTypes = [
  { id: 'b1', code: 'box', name: 'Бокс' },
  { id: 's1', code: 'step', name: 'Степ' },
]
ok(matchAzDirectionFromTariff('10 занятий Бокс', azTypes)?.id === 'b1', 'AZ direction boxing')
ok(matchAzDirectionFromTariff('8 занятий Степ', azTypes)?.id === 's1', 'AZ direction step')

const lines = [
  {
    id: '1',
    include: true,
    hall: 'az',
    cardNumber: '5802',
    clientName: 'Фролов',
    tariffName: '10 занятий Бокс',
    amount: 3600,
    matchStatus: 'none',
  },
  {
    id: '2',
    include: true,
    hall: 'az',
    cardNumber: '5802',
    clientName: 'Фролов',
    tariffName: '8 занятий Степ',
    amount: 4000,
    matchStatus: 'none',
  },
  {
    id: '3',
    include: true,
    hall: 'pz',
    cardNumber: '5776',
    clientName: 'Литвин',
    tariffName: '12/1 Elite',
    amount: 10000,
    matchStatus: 'none',
  },
  {
    id: '4',
    include: true,
    hall: 'pz',
    cardNumber: '1111',
    clientName: 'Уже есть',
    tariffName: '8/1',
    amount: 5000,
    matchStatus: 'one',
    clientId: 'c-exist',
  },
]

const collapsed = collapsePaymentLinesByCardLastWins(lines)
ok(collapsed.length === 3, 'collapse unique cards')
ok(collapsed.find((l) => l.cardNumber === '5802')?.tariffName.includes('Степ'), 'last AZ direction wins')

const actions = buildPaymentClientLinkActions({ lines, azTypes })
ok(actions.find((a) => a.cardNumber === '5802')?.kind === 'az_desk', 'az desk action')
ok(actions.find((a) => a.cardNumber === '5802')?.membershipTypeId === 's1', 'az last direction step')
ok(actions.find((a) => a.cardNumber === '5776')?.kind === 'pz_need_trainer', 'pz needs trainer')
ok(actions.find((a) => a.cardNumber === '1111')?.kind === 'skip_matched', 'matched skip')

ok(resolvePzLinkMode({ id: 't1', uses_tablet: false }) === 'lite', 'no tablet → lite')
ok(resolvePzLinkMode({ id: 't2', uses_tablet: true }) === 'clip', 'tablet → clip')

const bad = validatePaymentLinkAction({ kind: 'pz_need_trainer', trainerId: '' }, null)
ok(!bad.ok, 'pz without trainer rejected')

const good = validatePaymentLinkAction(
  { kind: 'pz_need_trainer', trainerId: 't1' },
  { id: 't1', uses_tablet: false },
)
ok(good.ok && good.mode === 'lite', 'pz lite ok')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales payments link checks passed')
