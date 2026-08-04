/**
 * node scripts/verify-desk-membership-ledger.mjs
 */
import {
  applyDeskMembershipDraftField,
  deskMembershipDraftEquals,
  deskMembershipLedgerKind,
  deskMembershipLedgerKindLabel,
  deskMembershipRowDraft,
  deskMembershipSignal,
  deskAzDirectionLabel,
  deskMembershipsContentSig,
  deskPackageEndIso,
  deskPackageStartIso,
  formatDeskPackageMonthsLabel,
  inferDeskPackageMonths,
  parseDeskPaidAmountInput,
  parseDeskTotalTrainingsInput,
  pickDeskActiveMembership,
  sortDeskMembershipLedger,
} from '../src/lib/admin/deskMembershipLedgerCore.js'
import { parseFlexibleDateToIso } from '../src/lib/dateRu.js'

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
ok(parseDeskTotalTrainingsInput('12') === 12, 'parse sessions')
ok(parseDeskTotalTrainingsInput('') == null, 'empty sessions')
ok(parseDeskTotalTrainingsInput('1.5') == null, 'reject fractional sessions')

ok(deskPackageEndIso('2026-07-21', 1) === '2026-08-21', '1 month end 21.07→21.08 inclusive')
ok(deskPackageEndIso('2026-02-20', 6) === '2026-08-20', '6 month end 20.02→20.08')
ok(deskPackageStartIso('2026-08-21', 1) === '2026-07-21', '1 month start reverse')
ok(deskPackageStartIso('2026-08-20', 6) === '2026-02-20', '6 month start reverse')
ok(inferDeskPackageMonths('2026-07-21', '2026-08-21') === 1, 'infer 1 month')
ok(inferDeskPackageMonths('2026-02-20', '2026-08-20') === 6, 'infer 6 months')
ok(formatDeskPackageMonthsLabel(1) === '1 месяц', 'label 1 month')
ok(formatDeskPackageMonthsLabel(3) === '3 месяца', 'label 3 months')
ok(formatDeskPackageMonthsLabel(6) === '6 месяцев', 'label 6 months')
ok(deskAzDirectionLabel(null, [{ id: 't1', name: 'Бокс' }]) === '—', 'az direction empty')
ok(deskAzDirectionLabel('t1', [{ id: 't1', name: 'Бокс' }]) === 'Бокс', 'az direction box')
ok(deskAzDirectionLabel('t2', [{ id: 't2', name: 'Техника дня' }]) === 'Техника дня', 'az direction tech day')
ok(deskAzDirectionLabel('t3', [{ id: 't3', name: '', code: 'BOX' }]) === 'BOX', 'az direction falls back to code')

const sig = deskMembershipSignal(
  [{ id: 'm', start_date: '2026-07-21', end_date: '2026-08-21', total_trainings: 0 }],
  '2026-08-01',
)
ok(sig.key === 'active' && /месяц/.test(sig.label), 'desk signal active not depleted')
ok(sig.color === '#22c55e', 'desk signal green')

const depletedWouldBe = deskMembershipSignal([], '2026-08-01')
ok(depletedWouldBe.key === 'no_membership', 'empty desk list')

ok(parseFlexibleDateToIso('19.07.2026') === '2026-07-19', 'parse ru date')
ok(parseFlexibleDateToIso('2026-07-19') === '2026-07-19', 'parse iso date')
ok(parseFlexibleDateToIso('2026-07-19T12:00:00Z') === '2026-07-19', 'parse iso datetime')
ok(parseFlexibleDateToIso('32.13.2026') === '', 'reject invalid ru date')

const draft0 = deskMembershipRowDraft({
  id: 'm1',
  start_date: '19.07.2026',
  end_date: '18.08.2026',
  paid_amount: 5000,
})
ok(draft0.start_date === '2026-07-19' && draft0.end_date === '2026-08-18', 'row draft normalizes ru')

const afterStart = applyDeskMembershipDraftField(draft0, 'start_date', '2026-07-20')
ok(afterStart.start_date === '2026-07-20', 'edit start keeps custom end unless package')
ok(afterStart.end_date === '2026-08-18', 'start change does not force package end')

const afterPkg = applyDeskMembershipDraftField(afterStart, 'package_months', '1')
ok(afterPkg.end_date === '2026-08-20', 'package recalculates end inclusive')

ok(deskMembershipDraftEquals(draft0, { ...draft0 }), 'draft equals')
ok(
  deskMembershipsContentSig([{ id: 'a', start_date: '2026-01-01', end_date: '2026-02-01' }]) ===
    deskMembershipsContentSig([{ id: 'a', start_date: '2026-01-01', end_date: '2026-02-01', paid_amount: null }]),
  'sig ignores null paid vs missing',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll desk membership ledger checks passed')
