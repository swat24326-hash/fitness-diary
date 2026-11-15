import { adminClubStatCardFoot } from '../src/lib/admin/adminClubStatsCardUi.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

ok(adminClubStatCardFoot({ available: true, open: false }) === '', 'idle empty')
ok(adminClubStatCardFoot({ available: true, open: true }) === '', 'selected empty')
ok(adminClubStatCardFoot({ available: false }) === 'нет данных', 'empty default')
ok(adminClubStatCardFoot({ available: false, emptyLabel: 'за период' }) === 'за период', 'empty custom')
ok(adminClubStatCardFoot({ busy: true, available: true }) === 'считаем…', 'busy')
ok(adminClubStatCardFoot({ available: true, idleHint: 'M+3' }) === 'M+3', 'idle hint')
ok(adminClubStatCardFoot({ available: true, open: true, idleHint: 'год 2026' }) === 'год 2026', 'hint when open')

console.log('verify-admin-club-stats-card-ui: ok')
