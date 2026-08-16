/**
 * node scripts/verify-attention-side-placement.mjs
 */
import {
  attentionSoftOccupancy,
  resolveAttentionSidePlacement,
  shouldDisplacePlanerkaForCallToday,
} from '../src/lib/admin/attentionSidePlacementCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(
  shouldDisplacePlanerkaForCallToday({ enableCallToday: true, hasCallQueue: true }),
  'displace when queue',
)
ok(
  !shouldDisplacePlanerkaForCallToday({ enableCallToday: true, hasCallQueue: false }),
  'no displace when empty queue',
)
ok(
  !shouldDisplacePlanerkaForCallToday({ enableCallToday: false, hasCallQueue: true }),
  'no displace when call disabled',
)

const empty = resolveAttentionSidePlacement({
  hasPnk: false,
  hasPlanerka: false,
  enableCallToday: true,
  hasCallQueue: false,
})
ok(empty.planerka === 'callToday' && empty.pnk === 'empty', 'free slots → call even if empty queue')

const pnkOnly = resolveAttentionSidePlacement({
  hasPnk: true,
  hasPlanerka: false,
  enableCallToday: true,
  hasCallQueue: false,
})
ok(pnkOnly.pnk === 'pnk' && pnkOnly.planerka === 'callToday', 'pnk + empty call card')

const planerkaOnly = resolveAttentionSidePlacement({
  hasPnk: false,
  hasPlanerka: true,
  enableCallToday: true,
  hasCallQueue: true,
})
ok(planerkaOnly.planerka === 'planerka' && planerkaOnly.pnk === 'callToday', 'planerka + call fills left')

const bothWithQueue = resolveAttentionSidePlacement({
  hasPnk: true,
  hasPlanerka: true,
  enableCallToday: true,
  hasCallQueue: true,
})
ok(
  bothWithQueue.pnk === 'pnk' && bothWithQueue.planerka === 'callToday' && bothWithQueue.callTodayShown,
  'both + queue → call replaces planerka',
)

const bothEmptyQueue = resolveAttentionSidePlacement({
  hasPnk: true,
  hasPlanerka: true,
  enableCallToday: true,
  hasCallQueue: false,
})
ok(
  bothEmptyQueue.pnk === 'pnk' &&
    bothEmptyQueue.planerka === 'planerka' &&
    !bothEmptyQueue.callTodayShown,
  'both + empty queue → keep planerka',
)

const noCall = resolveAttentionSidePlacement({
  hasPnk: true,
  hasPlanerka: true,
  enableCallToday: false,
  hasCallQueue: true,
})
ok(noCall.pnk === 'pnk' && noCall.planerka === 'planerka' && !noCall.callTodayShown, 'call disabled')

const occ = attentionSoftOccupancy(planerkaOnly)
ok(occ.hasPnk === true && occ.hasPlanerka === true, 'soft sees call as occupied')

if (failed) process.exit(1)
console.log('verify-attention-side-placement: all passed')
