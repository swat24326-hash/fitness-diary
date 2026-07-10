/**
 * node scripts/verify-sync-outbound-label.mjs
 */
import {
  formatSyncOutboundBannerMessage,
  formatSyncOutboundMenuLabel,
  formatSyncOutboundShort,
  formatSyncOutboundTitle,
} from '../src/lib/syncOutboundLabel.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(formatSyncOutboundShort({ total: 1 }) === '1 ждёт', 'short singular')
ok(formatSyncOutboundShort({ total: 3 }) === '3 ждут', 'short plural')
ok(formatSyncOutboundShort({ total: 0 }) === '', 'short empty')

ok(formatSyncOutboundTitle({ queue: 2, localOnly: 0 }).includes('2'), 'title queue')
ok(formatSyncOutboundTitle({ queue: 1, localOnly: 2 }).includes('1'), 'title mixed')
ok(formatSyncOutboundTitle({ busy: true, percent: 40, progressLabel: 'Клиенты' }).includes('40%'), 'title busy')

ok(formatSyncOutboundMenuLabel({ total: 5 }) === 'Синхронизировать (5)', 'menu label')
ok(formatSyncOutboundBannerMessage({ total: 2 }).includes('2'), 'banner count')

if (failed) process.exit(1)
console.log('verify-sync-outbound-label: all passed')
