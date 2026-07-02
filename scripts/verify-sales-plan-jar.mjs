import { buildJarCoinLayout, JAR_INNER_COIN_SLOTS } from '../src/lib/admin/salesPlanJar.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const empty = buildJarCoinLayout(0)
ok(empty.inner.length === 0, '0% no inner coins')
ok(empty.spill.length === 0, '0% no spill')
ok(empty.overflow === false, '0% not overflow')

const half = buildJarCoinLayout(50)
ok(half.inner.length === Math.round(0.5 * JAR_INNER_COIN_SLOTS), '50% half jar')

const full = buildJarCoinLayout(100)
ok(full.inner.length === JAR_INNER_COIN_SLOTS, '100% full jar')
ok(full.spill.length === 0, '100% no spill yet')

const over = buildJarCoinLayout(150)
ok(over.overflow === true, '150% overflow flag')
ok(over.rim.length >= 1, '150% rim heap')
ok(over.spill.length >= 1, '150% spill coins')
ok(over.inner.length === JAR_INNER_COIN_SLOTS, '150% jar still full inside')

process.exit(failed > 0 ? 1 : 0)
