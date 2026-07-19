/**
 * node scripts/verify-sync-motivation.mjs
 */
import {
  SYNC_FINISH_CARD_ID,
  SYNC_MOTIVATION_CARDS,
  cardLikelyNeedsScroll,
  createSyncSessionSeed,
  formatSyncMotto,
  getSyncMotivationCardById,
  getSyncMotivationZone,
  pickSyncMotivationCard,
  setLastSyncReport,
  getLastSyncReport,
} from '../src/lib/syncMotivationCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(SYNC_MOTIVATION_CARDS.length >= 40, `bank size ${SYNC_MOTIVATION_CARDS.length}`)
ok(!SYNC_MOTIVATION_CARDS.some((c) => ['7', '13', '24'].includes(c.id)), 'rejected ids absent')
ok(getSyncMotivationCardById(SYNC_FINISH_CARD_ID)?.id === '23', 'finish card 23')

ok(getSyncMotivationZone(0) === 0, 'zone 0')
ok(getSyncMotivationZone(24) === 0, 'zone 0 edge')
ok(getSyncMotivationZone(25) === 1, 'zone 1')
ok(getSyncMotivationZone(50) === 2, 'zone 2')
ok(getSyncMotivationZone(75) === 3, 'zone 3')
ok(getSyncMotivationZone(99) === 3, 'zone 3 edge')
ok(getSyncMotivationZone(100) === 4, 'zone 4')

const finish = pickSyncMotivationCard({ percent: 100, sessionSeed: 1 })
ok(finish.id === '23', 'pick at 100 → finish')

const seed = createSyncSessionSeed()
ok(typeof seed === 'number' && seed >= 0, 'session seed')

const a = pickSyncMotivationCard({ percent: 10, sessionSeed: 42, slot: 0 })
const b = pickSyncMotivationCard({ percent: 10, sessionSeed: 42, slot: 0 })
ok(a.id === b.id, 'same seed+slot → same card')

const c = pickSyncMotivationCard({ percent: 10, sessionSeed: 42, slot: 1, excludeIds: [a.id] })
ok(c.id !== a.id || SYNC_MOTIVATION_CARDS.length < 3, 'exclude + slot rotates')

const short = getSyncMotivationCardById('4')
const long = getSyncMotivationCardById('A7')
ok(!cardLikelyNeedsScroll(short), 'short card no scroll heuristic')
ok(cardLikelyNeedsScroll(long), 'long A7 needs scroll heuristic')
ok(cardLikelyNeedsScroll(getSyncMotivationCardById('M5')), 'long M5 needs scroll heuristic')

const motto = formatSyncMotto(short)
ok(motto.text.includes('Дисциплина'), 'format text')
ok(motto.source.includes('Джим'), 'format source')

const stored = setLastSyncReport({
  at: 1_700_000_000_000,
  tone: 'ok',
  parts: ['справочник', 'рабочая область (3 кл.)'],
  message: '',
})
ok(stored?.parts?.length === 2, 'set last report')
ok(getLastSyncReport()?.parts?.[0] === 'справочник', 'get last report')

if (failed) process.exit(1)
console.log('verify-sync-motivation: all passed')
