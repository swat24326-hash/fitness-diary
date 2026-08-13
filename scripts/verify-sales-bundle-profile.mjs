import {
  normalizeSalesBundleProfile,
  salesBundleProfileFlags,
} from '../src/lib/admin/salesBundleProfileCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeSalesBundleProfile('') === 'full', 'empty → full')
ok(normalizeSalesBundleProfile('SHELL') === 'shell', 'SHELL → shell')
ok(normalizeSalesBundleProfile('daily') === 'daily', 'daily')

const full = salesBundleProfileFlags('full')
ok(full.needFitCity && full.needDaily && full.needMonth, 'full needs all heavy')

const shell = salesBundleProfileFlags('shell')
ok(!shell.needDaily && !shell.needFitCity && shell.needMonth && shell.needPlanExpense, 'shell: month+plan, no daily/fit')
ok(shell.includeMonthDays, 'shell includes month days for vessel')
ok(shell.needTypes, 'shell includes types for forecast')
ok(shell.needTrainers, 'shell includes trainers for month stats FIO')

const daily = salesBundleProfileFlags('daily')
ok(daily.needDaily && !daily.needMonth && !daily.needFitCity, 'daily without fit by default')
ok(salesBundleProfileFlags('daily', '1').needFitCity, 'daily+include_fit_city')

const month = salesBundleProfileFlags('month')
ok(month.needMonth && !month.needDaily && !month.needFitCity, 'month profile')
ok(month.needTrainers, 'month includes trainers for labels')

process.exit(failed > 0 ? 1 : 0)
