import {
  buildStrategySnapshot,
  hydrateStrategyFromPlanRow,
  parseStrategySnapshot,
  renewalsSuggestFromSnapshot,
  topUpPackFromSnapshot,
  validateStrategySnapshotForSave,
} from '../src/lib/admin/salesStrategySnapshotCore.js'
import { strategySnapshotSessionKey } from '../src/lib/admin/salesStrategySnapshotSession.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const suggest = {
  ok: true,
  year: 2026,
  month: 8,
  renewalPct: 80,
  historyDepth: 3,
  horizon: 'current',
  candidates: [
    {
      clientId: 'c-open',
      clientName: 'Открытый',
      phone: '+7',
      cardNumber: '111',
      hall: 'pz',
      endDate: '2026-08-10',
      avgRub: 10000,
      source: 'history',
    },
  ],
  confirmedClosings: [
    {
      clientId: 'c-done',
      clientName: 'Купил',
      hall: 'tz',
      endDate: '2026-08-15',
      avgRub: 8000,
      factAmount: 9000,
      confirmed: true,
    },
  ],
  endingAlreadyPurchased: 1,
}

const pack = {
  ok: true,
  totalAmount: 1196000,
  budget: 1200000,
  budgetDelta: -4000,
  budgetTolerance: 15000,
  fittedToBudget: true,
  byHall: {
    pz: { nk: 100000, uk: 100000, dk: 50000, total: 250000 },
    tz: { nk: 50000, uk: 50000, dk: 20000, total: 120000 },
    az: { nk: 30000, uk: 30000, dk: 10000, total: 70000 },
  },
}

const built = buildStrategySnapshot({
  year: 2026,
  month: 8,
  renewalsSuggest: suggest,
  topUpPack: pack,
  updatedAt: '2026-08-03T12:00:00.000Z',
})
ok(built.ok, 'build snapshot ok')
ok(built.snapshot.candidates.length === 1, 'candidates in snapshot')
ok(built.snapshot.confirmedClosings.length === 1, 'confirmed in snapshot')
ok(built.snapshot.confirmedClosings[0].factAmount === 9000, 'factAmount kept')
ok(built.snapshot.pack.ok && built.snapshot.pack.totalAmount === 1196000, 'slim pack')

const parsed = parseStrategySnapshot(built.snapshot)
ok(parsed.ok, 'parse ok')
ok(parsed.snapshot.confirmedClosings[0].confirmed === true, 'confirmed flag')

const validated = validateStrategySnapshotForSave(built.snapshot)
ok(validated.ok, 'validate for save')

const fromSuggest = renewalsSuggestFromSnapshot(parsed.snapshot)
ok(fromSuggest.ok && fromSuggest.fromSnapshot, 'suggest from snapshot')
ok(fromSuggest.confirmedClosings.length === 1, 'hydrated confirmed')

const fromPack = topUpPackFromSnapshot(parsed.snapshot)
ok(fromPack?.ok && fromPack.totalAmount === 1196000, 'pack from snapshot')

const hydrated = hydrateStrategyFromPlanRow({ strategy_snapshot: built.snapshot })
ok(hydrated.ok, 'hydrate from plan row')
ok(hydrated.renewalsSuggest.candidates[0].clientId === 'c-open', 'hydrate open')

ok(!parseStrategySnapshot(null).ok, 'null snapshot fails')
ok(!buildStrategySnapshot({ year: 2026, month: 8, renewalsSuggest: { ok: false } }).ok, 'bad suggest')

const jsonRoundtrip = parseStrategySnapshot(JSON.stringify(built.snapshot))
ok(jsonRoundtrip.ok && jsonRoundtrip.snapshot.candidates.length === 1, 'JSON string roundtrip')

ok(
  strategySnapshotSessionKey('club-1', 2026, 8) === 'fd-strategy-snap:club-1:2026:8',
  'session key stable',
)

if (failed) {
  console.error(`\n${failed} strategy snapshot check(s) failed`)
  process.exit(1)
}
console.log('\nAll sales strategy snapshot checks passed')
