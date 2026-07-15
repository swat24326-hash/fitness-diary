/**
 * node scripts/verify-trainer-outreach-queue.mjs
 */

import {
  buildOutreachScenarioHint,
  buildTrainerAttentionSummaryByPrimaryScenario,
  pickNextOutreachClient,
  resolvePrimaryOutreachScenarioForClient,
  sortClientsForOutreachFilter,
} from '../src/lib/trainer/trainerOutreachQueue.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-07-15'
const memByClient = {
  a: [{ start_date: '2026-01-01', end_date: '2026-07-17', total_trainings: 10, used_trainings: 1 }],
  b: [{ start_date: '2026-01-01', end_date: '2026-07-14', total_trainings: 10, used_trainings: 10 }],
  c: [{ start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 10, used_trainings: 2 }],
  d: [{ start_date: '2026-01-01', end_date: '2026-06-20', total_trainings: 10, used_trainings: 10 }],
  e: [{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 8, used_trainings: 8 }],
}

const clients = [
  { id: 'a', name: 'Anna', birth_date: '1990-07-15', phone: '+79001111111' },
  { id: 'b', name: 'Boris', birth_date: '1990-08-01', phone: '+79002222222' },
  { id: 'c', name: 'Carl', phone: '+79003333333' },
  { id: 'd', name: 'Dina', phone: '+79004444444', max_chat_url: 'https://max.ru/u/dina' },
  { id: 'e', name: 'Egor', phone: '+79005555555' },
]

ok(
  resolvePrimaryOutreachScenarioForClient({ client: clients[0], memList: memByClient.a, today }) === 'birthdays',
  'birthday beats expiring for primary scenario',
)

ok(
  resolvePrimaryOutreachScenarioForClient({ client: clients[1], memList: memByClient.b, today }) === 'expired_recent',
  'expired yesterday is expired_recent',
)

ok(
  resolvePrimaryOutreachScenarioForClient({ client: clients[2], memList: memByClient.c, today }) == null,
  'active membership has no primary scenario',
)

ok(
  resolvePrimaryOutreachScenarioForClient({ client: clients[3], memList: memByClient.d, today }) === 'stale',
  'long expired is stale',
)

const summary = buildTrainerAttentionSummaryByPrimaryScenario({ clients, memByClient, today })
ok(summary.birthdays === 1, 'primary summary birthdays')
ok(summary.expiring === 0, 'primary summary no double count for birthday+expiring')
ok(summary.expired_recent === 2, 'primary summary expired_recent')
ok(summary.stale === 1, 'primary summary stale')
ok(summary.actionable === 4, 'primary summary actionable without overlap')

ok(buildOutreachScenarioHint('expiring', memByClient.a, today).includes('2'), 'expiring hint shows days left')
ok(buildOutreachScenarioHint('expired_recent', memByClient.b, today).includes('вчера'), 'expired_recent hint yesterday')
ok(buildOutreachScenarioHint('stale', memByClient.d, today).includes('25'), 'stale hint days since end')

const expiredClients = clients.filter((c) => c.id === 'b' || c.id === 'e')
const sorted = sortClientsForOutreachFilter(expiredClients, 'expired_recent', memByClient, new Set(), today)
ok(sorted[0]?.id === 'b', 'expired_recent sorted: most recent first')

const sent = new Set(['b'])
const next = pickNextOutreachClient(sorted, sent)
ok(next?.id === 'e', 'pick next skips sent')

const sortedExpiring = sortClientsForOutreachFilter([clients[0]], 'expiring', memByClient, new Set(), today)
ok(sortedExpiring[0]?.id === 'a', 'expiring sort keeps client')

if (failed) process.exit(1)
console.log('verify-trainer-outreach-queue: all passed')
