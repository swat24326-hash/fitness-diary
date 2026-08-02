/**
 * node scripts/verify-desk-membership-ledger.mjs
 */
import {
  deskMembershipLedgerKind,
  deskMembershipLedgerKindLabel,
  deskMembershipSignal,
  deskAzDirectionLabel,
  deskPackageEndIso,
  deskPackageStartIso,
  formatDeskPackageMonthsLabel,
  inferDeskPackageMonths,
  parseDeskPaidAmountInput,
  pickDeskActiveMembership,
  sortDeskMembershipLedger,
} from '../src/lib/admin/deskMembershipLedgerCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-08-01'
const list = [
  { id: 'old', start_date: '2025-01-01', end_date: '2025-12-31', total_trainings: 0 },
  { id: 'cur', start_date: '2026-07-01', end_date: '2026-09-30', total_trainings: 0 },
  { id: 'fut', start_date: '2026-10-01', end_date: '2026-12-31', total_trainings: 0 },
]

const active = pickDeskActiveMembership(list, today)
ok(active?.id === 'cur', 'active by calendar even with 0 trainings')
ok(deskMembershipLedgerKind(list[0], today, active.id) === 'expired', 'expired')
ok(deskMembershipLedgerKind(list[2], today, active.id) === 'future', 'future')
ok(deskMembershipLedgerKindLabel('active') === 'действующий', 'label ru')

const sorted = sortDeskMembershipLedger(list)
ok(sorted[0].id === 'fut', 'sort end desc')

ok(parseDeskPaidAmountInput('1 200') === 1200, 'parse paid')
ok(parseDeskPaidAmountInput('') == null, 'empty paid')

ok(deskPackageEndIso('2026-07-21', 1) === '2026-08-20', '1 month end 21.07→20.08')
ok(deskPackageStartIso('2026-08-20', 1) === '2026-07-21', '1 month start reverse')
ok(deskPackageStartIso('2026-08-18', 6) === '2026-02-19', '6 month start reverse')
ok(inferDeskPackageMonths('2026-07-21', '2026-08-20') === 1, 'infer 1 month')
ok(inferDeskPackageMonths('2026-02-19', '2026-08-18') === 6, 'infer 6 months')
ok(formatDeskPackageMonthsLabel(1) === '1 месяц', 'label 1 month')
ok(formatDeskPackageMonthsLabel(3) === '3 месяца', 'label 3 months')
ok(formatDeskPackageMonthsLabel(6) === '6 месяцев', 'label 6 months')
ok(deskAzDirectionLabel(null, [{ id: 't1', name: 'Бокс' }]) === '—', 'az direction empty')
ok(deskAzDirectionLabel('t1', [{ id: 't1', name: 'Бокс' }]) === 'Бокс', 'az direction box')
ok(deskAzDirectionLabel('t2', [{ id: 't2', name: 'Техника дня' }]) === 'Техника дня', 'az direction tech day')

const sig = deskMembershipSignal(
  [{ id: 'm', start_date: '2026-07-21', end_date: '2026-08-20', total_trainings: 0 }],
  '2026-08-01',
)
ok(sig.key === 'active' && /месяц/.test(sig.label), 'desk signal active not depleted')
ok(sig.color === '#22c55e', 'desk signal green')

const depletedWouldBe = deskMembershipSignal([], '2026-08-01')
ok(depletedWouldBe.key === 'no_membership', 'empty desk list')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll desk membership ledger checks passed')
