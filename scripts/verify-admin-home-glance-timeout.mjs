/**
 * node scripts/verify-admin-home-glance-timeout.mjs
 * Главная админа: облако с таймаутом, без вечного скелетона.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HOME_GLANCE_CLOUD_MS,
  HOME_SALES_GLANCE_MS,
  homeGlanceCloudFailMessage,
} from '../src/lib/admin/adminHomeGlanceTimeout.js'
import { buildClubCallShiftSummary, buildClubCallShiftSummaryCards } from '../src/lib/admin/clubCallShiftSummaryCore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

ok(HOME_GLANCE_CLOUD_MS === 8000, 'home glance cloud = 8s')
ok(HOME_SALES_GLANCE_MS === 12000, 'sales glance = 12s')
ok(
  homeGlanceCloudFailMessage(new Error('timeout')).includes('не отвечает'),
  'timeout → русское сообщение',
)
ok(
  homeGlanceCloudFailMessage(new Error('Failed to fetch')).includes('связи'),
  'failed fetch → русское сообщение',
)

const emptyCards = buildClubCallShiftSummaryCards(
  buildClubCallShiftSummary([], [], { day: '2026-08-23' }),
  { journalHref: '/admin/call-log' },
)
ok(emptyCards.length === 4, 'пустая смена → 4 плитки')
ok(emptyCards.every((c) => c.count === 0), 'пустая смена → нули')

const daySrc = readFileSync(join(root, 'src/lib/admin/adminClubDaySummaryService.js'), 'utf8')
ok(daySrc.includes('withHomeGlanceTimeout'), 'day summary: withHomeGlanceTimeout')
ok(daySrc.includes('Promise.all([refreshP, idbP])'), 'day summary: refresh || IDB параллельно')

const shiftSrc = readFileSync(join(root, 'src/lib/admin/clubCallShiftSummaryService.js'), 'utf8')
ok(shiftSrc.includes('withHomeGlanceTimeout'), 'shift summary: withHomeGlanceTimeout')
ok(shiftSrc.includes('homeGlanceCloudFailMessage'), 'shift summary: humanize reason')

const salesSrc = readFileSync(join(root, 'src/components/admin/AdminHomeSalesPlanGlance.jsx'), 'utf8')
ok(salesSrc.includes('HOME_SALES_GLANCE_MS'), 'sales glance: HOME_SALES_GLANCE_MS')

const dashSrc = readFileSync(join(root, 'src/pages/admin/AdminDashboard.jsx'), 'utf8')
ok(dashSrc.includes('withHomeGlanceTimeout'), 'dashboard CQ: withHomeGlanceTimeout')

const panelSrc = readFileSync(join(root, 'src/components/admin/ClubCallShiftSummaryPanel.jsx'), 'utf8')
ok(panelSrc.includes('errText') && panelSrc.includes('buildClubCallShiftSummary'), 'shift panel: нули при ошибке без кэша')

if (failed) {
  console.error(`verify-admin-home-glance-timeout: ${failed} failed`)
  process.exit(1)
}
console.log('verify-admin-home-glance-timeout: all passed')
