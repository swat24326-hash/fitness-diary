/**
 * node scripts/verify-attention-side-placement.mjs
 */
import {
  attentionSoftOccupancy,
  resolveAttentionSidePlacement,
} from '../src/lib/admin/attentionSidePlacementCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const empty = resolveAttentionSidePlacement({
  hasPnk: false,
  hasPlanerka: false,
  enableCallToday: true,
  callTodayReady: true,
})
ok(empty.planerka === 'callToday' && empty.pnk === 'empty', 'only call → right slot')

const pnkOnly = resolveAttentionSidePlacement({
  hasPnk: true,
  hasPlanerka: false,
  enableCallToday: true,
  callTodayReady: true,
})
ok(pnkOnly.pnk === 'pnk' && pnkOnly.planerka === 'callToday', 'pnk + call')

const planerkaOnly = resolveAttentionSidePlacement({
  hasPnk: false,
  hasPlanerka: true,
  enableCallToday: true,
  callTodayReady: true,
})
ok(planerkaOnly.planerka === 'planerka' && planerkaOnly.pnk === 'callToday', 'planerka + call fills left hole')

const both = resolveAttentionSidePlacement({
  hasPnk: true,
  hasPlanerka: true,
  enableCallToday: true,
  callTodayReady: true,
})
ok(both.pnk === 'pnk' && both.planerka === 'planerka' && !both.callTodayShown, 'pnk+planerka hide call')

const noCall = resolveAttentionSidePlacement({
  hasPnk: false,
  hasPlanerka: false,
  enableCallToday: false,
  callTodayReady: true,
})
ok(noCall.pnk === 'empty' && noCall.planerka === 'empty', 'call disabled')

const notReady = resolveAttentionSidePlacement({
  hasPnk: false,
  hasPlanerka: false,
  enableCallToday: true,
  callTodayReady: false,
})
ok(notReady.planerka === 'empty', 'call not ready yet')

const occ = attentionSoftOccupancy(planerkaOnly)
ok(occ.hasPnk === true && occ.hasPlanerka === true, 'soft sees call as occupied')

const occBoth = attentionSoftOccupancy(both)
ok(occBoth.hasPnk && occBoth.hasPlanerka, 'soft blocked when both primary')

if (failed) process.exit(1)
console.log('verify-attention-side-placement: all passed')
