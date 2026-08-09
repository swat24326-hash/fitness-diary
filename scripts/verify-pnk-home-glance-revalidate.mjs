/**
 * node scripts/verify-pnk-home-glance-revalidate.mjs
 */
import {
  PNK_HOME_GLANCE_REVALIDATE_MIN_MS,
  shouldNetworkRevalidatePnkHomeGlance,
} from '../src/lib/pnk/pnkHomeGlanceRevalidateCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const now = 1_000_000
ok(PNK_HOME_GLANCE_REVALIDATE_MIN_MS === 25_000, 'min 25s')
ok(
  shouldNetworkRevalidatePnkHomeGlance({ force: true, savedAt: now, hasCachedCards: true, now }),
  'force always',
)
ok(
  shouldNetworkRevalidatePnkHomeGlance({ hasCachedCards: false, now }),
  'cold without cache',
)
ok(
  !shouldNetworkRevalidatePnkHomeGlance({
    savedAt: now - 5_000,
    hasCachedCards: true,
    now,
  }),
  'skip within debounce',
)
ok(
  shouldNetworkRevalidatePnkHomeGlance({
    savedAt: now - PNK_HOME_GLANCE_REVALIDATE_MIN_MS,
    hasCachedCards: true,
    now,
  }),
  'fetch at boundary',
)
ok(
  shouldNetworkRevalidatePnkHomeGlance({
    savedAt: now - PNK_HOME_GLANCE_REVALIDATE_MIN_MS - 1,
    hasCachedCards: true,
    now,
  }),
  'fetch after debounce',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll ok')
