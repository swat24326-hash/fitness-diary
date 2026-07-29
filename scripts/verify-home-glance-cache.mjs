/**
 * Чистые проверки homeGlanceCache (без React / sessionStorage браузера).
 * sessionStorage в node отсутствует — тестируем looksSame + контракт createGlanceCache API.
 */
import {
  createGlanceCache,
  glancePayloadLooksSame,
} from '../src/lib/homeGlanceCache.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const cache = createGlanceCache({ ns: 'admin-cq', ttlMs: 60 * 60 * 1000 })
ok(cache.ns === 'admin-cq', 'ns')
ok(cache.ttlMs === 3600000, 'ttl 60m')
ok(typeof cache.key === 'function', 'key')
ok(typeof cache.peek === 'function', 'peek')
ok(typeof cache.read === 'function', 'read')
ok(typeof cache.write === 'function', 'write')
ok(typeof cache.isFresh === 'function', 'isFresh')
ok(typeof cache.invalidate === 'function', 'invalidate')

ok(cache.isFresh(Date.now() - 1000), 'fresh within ttl')
ok(!cache.isFresh(Date.now() - 3600001), 'stale after ttl')
ok(!cache.isFresh(null), 'null savedAt not fresh')

ok(
  glancePayloadLooksSame(
    { scorePct: 80, chipLabel: 'ок', hot: false, reviewCount: 1 },
    { scorePct: 80, chipLabel: 'ок', hot: false, reviewCount: 1 },
    ['scorePct', 'chipLabel', 'hot', 'reviewCount'],
  ),
  'looksSame equal',
)
ok(
  !glancePayloadLooksSame(
    { scorePct: 80, reviewCount: 1 },
    { scorePct: 81, reviewCount: 1 },
    ['scorePct', 'reviewCount'],
  ),
  'looksSame score differs',
)

const sales = createGlanceCache({ ns: 'admin-sales-plan', ttlMs: 2 * 60 * 60 * 1000 })
ok(sales.ttlMs === 7200000, 'sales ttl 2h')

const day = createGlanceCache({ ns: 'admin-day-summary', ttlMs: 10 * 60 * 1000 })
ok(day.ttlMs === 600000, 'day summary ttl 10m')

const trainer = createGlanceCache({ ns: 'trainer-cq', ttlMs: 45 * 60 * 1000 })
ok(trainer.ttlMs === 2700000, 'trainer cq ttl 45m')

console.log('verify-home-glance-cache: all ok')
