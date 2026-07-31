/**

 * node scripts/verify-trainer-attention-summary.mjs

 */

import {

  STALE_TRAINING_DAYS,

  buildLastCompletedTrainingDateByClientId,

  buildTrainerAttentionSummary,

  daysSinceIsoDate,

  isClientStaleForAttention,

  isTrainerClientQuickFilter,

  normalizeTrainerClientQuickFilter,

} from '../src/lib/trainer/trainerAttentionSummary.js'

import { isMembershipExpiredRecently } from '../src/lib/trainer/trainerClientOutreachCore.js'
import {
  buildTrainerAttentionItems,
  groupTrainerAttentionItems,
} from '../src/lib/trainer/trainerAttentionUiCore.js'



let failed = 0



function ok(cond, msg) {

  if (cond) console.log(`ok: ${msg}`)

  else {

    console.error(`FAIL: ${msg}`)

    failed++

  }

}



ok(daysSinceIsoDate('2026-07-01', '2026-07-11') === 10, 'daysSinceIsoDate')

ok(daysSinceIsoDate('', '2026-07-11') == null, 'daysSinceIsoDate empty')



const lastMap = buildLastCompletedTrainingDateByClientId([

  { client_id: 'c1', status: 'draft', date: '2026-07-10' },

  { client_id: 'c1', status: 'completed', date: '2026-07-05' },

  { client_id: 'c1', status: 'completed', date: '2026-07-09' },

  { client_id: 'c2', status: 'completed', date: '2026-06-01' },

])

ok(lastMap.c1 === '2026-07-09', 'last completed ignores draft')

ok(lastMap.c2 === '2026-06-01', 'last completed c2')



const activeMem = [{ start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 10, used_trainings: 2 }]

ok(

  !isClientStaleForAttention({

    memList: activeMem,

    today: '2026-07-11',

    staleDays: 14,

  }),

  'active membership never stale (even without trainings)',

)



ok(

  isClientStaleForAttention({

    memList: [{ start_date: '2026-01-01', end_date: '2026-06-20', total_trainings: 10, used_trainings: 10 }],

    today: '2026-07-11',

    staleDays: 14,

  }),

  'stale when abo ended 21 days ago',

)



ok(

  !isClientStaleForAttention({

    memList: [{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 10, used_trainings: 10 }],

    today: '2026-07-11',

    staleDays: 14,

  }),

  'not stale when abo ended yesterday (expired_recent)',

)



ok(

  !isClientStaleForAttention({

    memList: [{ start_date: '2026-01-01', end_date: '2026-07-05', total_trainings: 10, used_trainings: 10 }],

    today: '2026-07-11',

    staleDays: 14,

  }),

  'not stale when abo ended 6 days ago (expired_recent window)',

)



ok(

  isMembershipExpiredRecently(

    [{ start_date: '2026-01-01', end_date: '2026-07-07', total_trainings: 10, used_trainings: 10 }],

    '2026-07-11',

  ),

  'expired_recent at 4 days after end',

)



ok(

  isMembershipExpiredRecently(

    [{ start_date: '2026-01-01', end_date: '2026-07-02', total_trainings: 10, used_trainings: 10 }],

    '2026-07-15',

  ),

  'expired_recent at 13 days after end',

)



ok(

  !isMembershipExpiredRecently(

    [{ start_date: '2026-01-01', end_date: '2026-07-01', total_trainings: 10, used_trainings: 10 }],

    '2026-07-15',

  ),

  'not expired_recent at 14 days (handoff to stale)',

)



ok(

  isClientStaleForAttention({

    memList: [{ start_date: '2026-01-01', end_date: '2026-07-01', total_trainings: 10, used_trainings: 10 }],

    today: '2026-07-15',

    staleDays: 14,

  }),

  'stale at exactly 14 days after end',

)



ok(

  isClientStaleForAttention({

    memList: [{ start_date: '2026-01-01', end_date: '2026-05-16', total_trainings: 10, used_trainings: 10 }],

    today: '2026-07-15',

    staleDays: 14,

  }),

  'stale at exactly 60 days after end',

)



ok(

  !isClientStaleForAttention({

    memList: [{ start_date: '2026-01-01', end_date: '2026-05-15', total_trainings: 10, used_trainings: 10 }],

    today: '2026-07-15',

    staleDays: 14,

  }),

  'not stale at 61 days (only inactive)',

)



const gapMem = [

  { start_date: '2026-01-01', end_date: '2026-06-01', total_trainings: 10, used_trainings: 10 },

  { start_date: '2026-08-01', end_date: '2026-09-01', total_trainings: 8, used_trainings: 0 },

]

ok(!isMembershipExpiredRecently(gapMem, '2026-07-15'), 'trainer: upcoming next card — not expired_recent')

ok(

  !isClientStaleForAttention({ memList: gapMem, today: '2026-07-15', staleDays: 14 }),

  'trainer: upcoming next card — not stale',

)



const today = '2026-07-15'

const summary = buildTrainerAttentionSummary({

  today,

  staleDays: STALE_TRAINING_DAYS,

  clients: [

    { id: 'a', birth_date: '1990-07-15' },

    { id: 'b', birth_date: '1990-08-01' },

    { id: 'c' },

    { id: 'd' },

    { id: 'e' },

  ],

  memByClient: {

    a: [{ start_date: '2026-01-01', end_date: '2026-07-17', total_trainings: 10, used_trainings: 1 }],

    b: [{ start_date: '2026-01-01', end_date: '2026-07-14', total_trainings: 10, used_trainings: 10 }],

    c: activeMem,

    d: [{ start_date: '2026-01-01', end_date: '2026-06-20', total_trainings: 10, used_trainings: 10 }],

    e: [{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 8, used_trainings: 8 }],

  },

})



ok(summary.birthdays === 1, 'birthday today only')

ok(summary.expiring === 0, 'expiring not counted when birthday is primary')

ok(summary.expired_recent === 2, 'expired recent: yesterday (b) and 5 days ago (e)')

ok(summary.stale === 1, 'stale only d (abo ended 25 days ago)')

ok(summary.actionable === 4, 'actionable without overlap (primary scenario)')

ok(isTrainerClientQuickFilter('stale'), 'stale is valid filter')

ok(normalizeTrainerClientQuickFilter('expired_remaining') === 'expired_recent', 'legacy filter alias')

ok(!isTrainerClientQuickFilter('nope'), 'invalid filter')

const uiItems = buildTrainerAttentionItems({
  pnk: 2,
  birthdays: 1,
  expiring: 0,
  expired_recent: 3,
  stale: 4,
  staleDays: STALE_TRAINING_DAYS,
  staleMaxDays: 60,
})
ok(
  uiItems.map((i) => i.key).join(',') === 'pnk,birthdays,expiring,expired_recent,stale',
  'attention UI order: base then path',
)
const uiGroups = groupTrainerAttentionItems(uiItems)
ok(uiGroups.length === 2, 'two attention UI groups')
ok(uiGroups[0]?.id === 'base' && uiGroups[0].cards.length === 2, 'base: PNK + DR')
ok(uiGroups[1]?.id === 'path' && uiGroups[1].cards.length === 3, 'path: abo funnel')

if (failed) process.exit(1)

console.log('verify-trainer-attention-summary: all passed')

