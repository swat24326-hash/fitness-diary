/**
 * patchOrInsertClubSalesPlanRow: UPDATE не трогает чужие поля; INSERT если строки нет.
 */
import { patchOrInsertClubSalesPlanRow } from '../src/lib/admin/salesPlanRowPersistCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

function makeClient({ existing }) {
  let lastUpdatePatch = null
  let lastInsertRow = null
  const chainEq = {
    eq() {
      return this
    },
    select() {
      return this
    },
    async maybeSingle() {
      if (!existing) return { data: null, error: null }
      return {
        data: { ...existing, ...lastUpdatePatch, club_id: existing.club_id },
        error: null,
      }
    },
    async single() {
      return { data: lastInsertRow, error: null }
    },
  }
  return {
    _lastUpdatePatch: () => lastUpdatePatch,
    _lastInsertRow: () => lastInsertRow,
    from() {
      return {
        update(patch) {
          lastUpdatePatch = patch
          return chainEq
        },
        insert(row) {
          lastInsertRow = row
          return chainEq
        },
      }
    },
  }
}

const existing = {
  club_id: 'c1',
  year: 2026,
  month: 8,
  plan_level_3: 1_200_000,
  plan_matrix: { pz_dk: { count: 10, avg_check: 5000 } },
  strategy_snapshot: null,
}

const clientUpdate = makeClient({ existing })
const upd = await patchOrInsertClubSalesPlanRow(clientUpdate, {
  clubId: 'c1',
  year: 2026,
  month: 8,
  patch: { strategy_snapshot: { v: 1, year: 2026, month: 8 } },
  selectCols: 'plan_level_3, strategy_snapshot',
})
ok(upd.wrote === 'update', 'existing row → update')
ok(upd.data?.plan_level_3 === 1_200_000, 'update keeps plan_level_3 from existing merge')
ok(clientUpdate._lastInsertRow() == null, 'no insert when row exists')
ok(
  clientUpdate._lastUpdatePatch()?.strategy_snapshot?.v === 1,
  'update patch only carries snapshot',
)
ok(!('plan_level_3' in (clientUpdate._lastUpdatePatch() || {})), 'update patch does not send levels')

const clientInsert = makeClient({ existing: null })
const ins = await patchOrInsertClubSalesPlanRow(clientInsert, {
  clubId: 'c1',
  year: 2026,
  month: 8,
  patch: { strategy_snapshot: { v: 2 } },
  selectCols: 'strategy_snapshot',
})
ok(ins.wrote === 'insert', 'missing row → insert')
ok(clientInsert._lastInsertRow()?.club_id === 'c1', 'insert has club_id')
ok(clientInsert._lastInsertRow()?.strategy_snapshot?.v === 2, 'insert has snapshot')

const bad = await patchOrInsertClubSalesPlanRow(null, {
  clubId: 'c1',
  year: 2026,
  month: 8,
  patch: { x: 1 },
  selectCols: 'x',
})
ok(bad.error && bad.wrote == null, 'bad client → error')

if (failed) {
  console.error(`\n${failed} sales plan row persist check(s) failed`)
  process.exit(1)
}
console.log('\nAll sales plan row persist checks passed')
