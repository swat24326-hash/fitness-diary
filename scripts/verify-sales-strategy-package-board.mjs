import { buildStrategyPackageBoard } from '../src/lib/admin/salesStrategyPackageBoardCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const pack = {
  ok: true,
  totalAmount: 1173673,
  totalWithExtra: 1199999,
  planExtraRub: 26328,
  prevExtraRub: 37611,
  planExtraPct: 70,
  level3Budget: 1200000,
  budget: 1173672,
  fittedToBudget: true,
  cells: {
    pz_dk: { count: 55 },
    tz_dk: { count: 99 },
    az_dk: { count: 42 },
    pz_nk: { count: 40 },
    tz_nk: { count: 30 },
    az_nk: { count: 20 },
    pz_uk: { count: 20 },
    tz_uk: { count: 14 },
    az_uk: { count: 10 },
  },
}

const board = buildStrategyPackageBoard({
  renewalsSuggest: { ok: true, count: 196, amount: 800000 },
  topUpPack: pack,
})
ok(board.ok && board.mode === 'full', 'full board')
ok(board.pieces === 330, '330 pieces')
ok(board.hallsRub === 1173673, 'halls rub')
ok(board.planExtraRub === 26328, 'extra')
ok(board.level3Rub === 1200000, 'level 3')
ok(board.totalWithExtraRub === 1199999, 'total with extra')
ok(board.fittedToBudget === true, 'fitted when L3 set')

const noL3 = buildStrategyPackageBoard({
  renewalsSuggest: { ok: true, count: 1, amount: 1 },
  topUpPack: { ...pack, level3Budget: 0, budget: 0, fittedToBudget: true },
})
ok(noL3.fittedToBudget == null, 'fitted null without L3')

const dkOnly = buildStrategyPackageBoard({
  renewalsSuggest: { ok: true, count: 10, amount: 50000 },
  topUpPack: null,
})
ok(dkOnly.ok && dkOnly.mode === 'dk_only' && dkOnly.pieces === 10, 'dk-only board')

ok(!buildStrategyPackageBoard({}).ok, 'empty fails')

if (failed) {
  console.error(`\n${failed} package board check(s) failed`)
  process.exit(1)
}
console.log('\nAll sales strategy package board checks passed')
