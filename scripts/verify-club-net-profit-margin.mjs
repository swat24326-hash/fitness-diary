import {
  buildNetProfitMarginMeta,
  computeNetProfitMarginPercent,
  describeNetProfitMarginTone,
  enrichFinanceSnapshotWithNetProfitMargin,
  formatNetProfitMarginPercent,
  NET_PROFIT_MARGIN_OK_FROM,
  NET_PROFIT_MARGIN_STRONG_FROM,
  NET_PROFIT_MARGIN_WEAK_BELOW,
} from '../src/lib/admin/clubNetProfitMarginCore.js'
import { buildClubFinanceForecast, buildIskraClubFinanceBlock } from '../src/lib/admin/clubFinanceForecastCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

ok(NET_PROFIT_MARGIN_WEAK_BELOW === 15, 'weak below 15')
ok(NET_PROFIT_MARGIN_OK_FROM === 20, 'ok from 20 reference')
ok(NET_PROFIT_MARGIN_STRONG_FROM === 25, 'strong from 25')

ok(computeNetProfitMarginPercent(250_000, 1_000_000) === 25, '25% margin')
ok(computeNetProfitMarginPercent(200_000, 1_000_000) === 20, '20% margin')
ok(computeNetProfitMarginPercent(100_000, 1_000_000) === 10, '10% margin')
ok(computeNetProfitMarginPercent(-50_000, 500_000) === -10, 'negative margin')
ok(computeNetProfitMarginPercent(100, 0) === null, 'zero gross → null')
ok(computeNetProfitMarginPercent(100, -1000) === null, 'negative gross → null')
ok(formatNetProfitMarginPercent(18.5) === '18,5%', 'ru percent format')
ok(formatNetProfitMarginPercent(null) === '—', 'null percent → dash')

ok(describeNetProfitMarginTone(-1).labelRu === 'убыток', 'negative → убыток')
ok(describeNetProfitMarginTone(10).tone === 'weak' && describeNetProfitMarginTone(10).labelRu === 'риск', '<15 риск')
ok(describeNetProfitMarginTone(14.9).tone === 'weak', '14.9 weak')
ok(describeNetProfitMarginTone(15).tone === 'ok', '15 ok boundary')
ok(describeNetProfitMarginTone(20).tone === 'ok', '20 ok')
ok(describeNetProfitMarginTone(24.9).tone === 'ok', '24.9 ok')
ok(describeNetProfitMarginTone(25).tone === 'strong', '25 strong boundary')
ok(describeNetProfitMarginTone(null).tone === 'muted', 'null tone muted')

const enriched = enrichFinanceSnapshotWithNetProfitMargin({
  netProfit: 306_193,
  earningsGross: 1_000_000,
})
ok(enriched.netProfitMargin === 30.6, 'enrich snapshot margin pct')
ok(enriched.netProfitMarginTone === 'strong', 'enrich snapshot tone')
ok(enriched.netProfitMarginLabelRu === 'отлично', 'enrich snapshot label')

const meta = buildNetProfitMarginMeta(-116_265, 1_200_000)
ok(meta.pct != null && meta.pct < 0, 'screenshot-like negative margin')
ok(meta.label_ru === 'убыток', 'negative margin label')

const today = new Date(2026, 6, 15)
const rows = [
  { report_date: '2026-07-01', profit_nk: 400_000, refunds_amount: 50_000 },
  { report_date: '2026-07-02', profit_nk: 400_000, refunds_amount: 50_000 },
  { report_date: '2026-07-03', profit_nk: 400_000, refunds_amount: 50_000 },
]
const fc = buildClubFinanceForecast({
  monthRows: rows,
  year: 2026,
  month: 7,
  expense: 360_000,
  membershipTypes: [],
  today,
})
ok(fc.ok, 'forecast ok for margin integration')
ok(typeof fc.fact.netProfitMargin === 'number', 'fact margin in forecast block')
ok(typeof fc.forecast.netProfitMargin === 'number', 'forecast margin in forecast block')
ok(
  fc.fact.netProfitMargin === computeNetProfitMarginPercent(fc.fact.netProfit, fc.fact.earningsGross),
  'fact margin matches formula',
)
ok(
  fc.forecast.netProfitMargin ===
    computeNetProfitMarginPercent(fc.forecast.netProfit, fc.forecast.earningsGross),
  'forecast margin matches formula',
)

const closed = buildClubFinanceForecast({
  monthRows: rows,
  year: 2026,
  month: 6,
  expense: 360_000,
  membershipTypes: [],
  today: new Date(2026, 6, 15),
})
ok(closed.ok && closed.closedMonth, 'closed month')
ok(closed.fact.netProfitMargin === closed.forecast.netProfitMargin, 'closed month fact=forecast margin')

const iskra = buildIskraClubFinanceBlock({
  monthRows: rows,
  year: 2026,
  month: 7,
  expense: 360_000,
  membershipTypes: [],
  today,
})
ok(iskra.available, 'iskra block available')
ok(typeof iskra.fact.net_profit_margin_pct === 'number', 'iskra fact margin')
ok(typeof iskra.forecast.net_profit_margin_pct === 'number', 'iskra forecast margin')
ok(iskra.fact.gross_rub === fc.fact.earningsGross, 'iskra gross matches fact gross')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll club-net-profit-margin checks passed')
