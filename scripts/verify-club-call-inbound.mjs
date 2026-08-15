/**
 * node scripts/verify-club-call-inbound.mjs
 */
import {
  buildClubCallInboundInsertRow,
  detectMoiZvonkiCallDirection,
  resolveInboundClientByPhone,
  shouldCreateInboundFromFinish,
} from '../src/lib/admin/clubCallInboundCore.js'
import { filterClubCallLogRowsByStatus, shapeClubCallLogApiRow } from '../src/lib/admin/clubCallLogCore.js'
import { buildClubCallStats } from '../src/lib/admin/clubOutreachStatsCore.js'
import { shapeCallFinishFromMoiZvonkiEvent } from '../src/lib/admin/clubCallOutcomeCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(detectMoiZvonkiCallDirection({ direction: 'incoming' }) === 'inbound', 'dir incoming')
ok(detectMoiZvonkiCallDirection({ call_type: 'outbound' }) === 'outbound', 'dir outbound')
ok(detectMoiZvonkiCallDirection({}) === 'unknown', 'dir unknown')

ok(shouldCreateInboundFromFinish({ direction: 'incoming' }, false) === true, 'create inbound')
ok(shouldCreateInboundFromFinish({ direction: 'outgoing' }, false) === false, 'skip outbound orphan')
ok(shouldCreateInboundFromFinish({}, true) === false, 'skip if matched')
ok(shouldCreateInboundFromFinish({}, false) === false, 'unknown without match → no invent inbound')
ok(shouldCreateInboundFromFinish({ inbound: true }, false) === true, 'bool inbound')

ok(
  resolveInboundClientByPhone(
    [
      { id: 'a', phone: '89531112233' },
      { id: 'b', phone: '79001112233' },
    ],
    '89531112233',
  ).status === 'one',
  'resolve one',
)
ok(
  resolveInboundClientByPhone(
    [
      { id: 'a', phone: '79001112233' },
      { id: 'b', phone: '+7 900 111-22-33' },
    ],
    '79001112233',
  ).status === 'conflict',
  'resolve conflict',
)
ok(resolveInboundClientByPhone([{ id: 'a', phone: '79009999999' }], '79001112233').status === 'none', 'resolve none')

const finish = shapeCallFinishFromMoiZvonkiEvent({
  client_number: '89531112233',
  answered: 0,
  duration: 12,
  db_call_id: 'mz-1',
  start_time: 1723710000,
  end_time: 1723710012,
})
const built = buildClubCallInboundInsertRow({ club_id: 'club1', client_id: 'c1', finish })
ok(built.ok && built.row.direction === 'inbound' && built.row.status === 'ok', 'inbound insert row')
ok(built.row.client_id === 'c1' && built.row.mz_db_call_id === 'mz-1', 'inbound fields')

const shaped = shapeClubCallLogApiRow({
  id: '1',
  club_id: 'club1',
  client_id: null,
  direction: 'inbound',
  status: 'ok',
  outcome: 'missed',
  phone: '79001112233',
})
ok(shaped.direction === 'inbound' && shaped.client_id === null, 'shape nullable client')

const rows = [
  { status: 'ok', direction: 'inbound', outcome: 'answered', client_id: 'c1' },
  { status: 'ok', direction: 'inbound', outcome: 'missed', client_id: 'c2' },
  { status: 'ok', direction: 'outbound', outcome: 'answered', client_id: 'c3', duration_sec: 40 },
]
ok(filterClubCallLogRowsByStatus(rows, 'inbound').length === 2, 'filter inbound')
ok(filterClubCallLogRowsByStatus(rows, 'inbound_missed').length === 1, 'filter inbound missed')
ok(filterClubCallLogRowsByStatus(rows, 'outbound').length === 1, 'filter outbound')

const stats = buildClubCallStats(rows)
ok(stats.inbound_total === 2 && stats.inbound_answered === 1 && stats.inbound_missed === 1, 'stats inbound')
ok(stats.outbound_total === 1, 'stats outbound')

if (failed) process.exit(1)
console.log('verify-club-call-inbound: all passed')
