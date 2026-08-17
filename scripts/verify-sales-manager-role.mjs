import {
  assertSalesPlanScopeForRole,
  canSalesManagerAccessClub,
  canViewSalesPayroll,
  isSalesManagerRole,
  normalizeAppRole,
  salesFinanceForecastVariantForRole,
  stripSalesBundleForManager,
} from '../src/lib/admin/salesAccessCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeAppRole('менеджер по продажам') === 'sales_manager', 'cyrillic role')
ok(isSalesManagerRole('sales_manager'), 'is sales manager')
ok(!isSalesManagerRole('trainer'), 'not trainer')
ok(canSalesManagerAccessClub('a', 'a'), 'same club')
ok(!canSalesManagerAccessClub('a', 'b'), 'different club')
ok(assertSalesPlanScopeForRole('directions', true).ok, 'manager directions ok')
ok(assertSalesPlanScopeForRole('strategy_snapshot', true).ok, 'manager strategy snapshot ok')
ok(!assertSalesPlanScopeForRole('promotions', true).ok, 'manager promotions blocked')
ok(!assertSalesPlanScopeForRole('levels', true).ok, 'manager levels blocked')

const stripped = stripSalesBundleForManager(
  {
    expense: { amount: 1 },
    month_summary: { profitTotal: 100, expense: 1, trainerPayroll: 2, aerobicPayroll: 3, netProfit: 97, netProfitMargin: 9.7 },
  },
  true,
)
ok(stripped.expense === undefined, 'strip expense')
ok(stripped.month_summary.netProfit === undefined, 'strip net profit')
ok(stripped.month_summary.netProfitMargin === undefined, 'strip net profit margin')
ok(stripped.month_summary.profitTotal === 100, 'keep profit total')
ok(stripped.month_summary.trainerPayroll === undefined, 'strip trainer payroll')
ok(stripped.month_summary.aerobicPayroll === undefined, 'strip aerobic payroll')

ok(!canViewSalesPayroll('sales_manager'), 'manager cannot view payroll')
ok(canViewSalesPayroll('admin'), 'admin can view payroll')
ok(salesFinanceForecastVariantForRole('sales_manager') === 'plan', 'manager forecast plan only')
ok(salesFinanceForecastVariantForRole('admin') === 'full', 'admin forecast full')

process.exit(failed > 0 ? 1 : 0)
