import { buildPlanProgressVisual, PLAN_PROGRESS_MARKER_STEP } from '../src/lib/admin/salesPlanProgress.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const empty = buildPlanProgressVisual(0)
ok(empty.fillPercent === 0, '0% empty fill')
ok(empty.markers.length === 0, '0% no markers')
ok(empty.overflow === false, '0% not overflow')

const half = buildPlanProgressVisual(50)
ok(half.fillPercent === 50, '50% half fill')
ok(half.markers.length >= 1, '50% has markers')

const full = buildPlanProgressVisual(100)
ok(full.fillPercent === 100, '100% full fill')
ok(full.overflow === false, '100% not overflow')
ok(full.markers.length === Math.ceil(100 / PLAN_PROGRESS_MARKER_STEP), '100% marker count')

const over = buildPlanProgressVisual(150)
ok(over.overflow === true, '150% overflow flag')
ok(over.fillPercent === 100, '150% bar capped at 100')
ok(over.overflowPercent === 50, '150% overflow delta')

process.exit(failed > 0 ? 1 : 0)
