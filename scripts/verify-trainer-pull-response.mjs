/**
 * node scripts/verify-trainer-pull-response.mjs
 * Клиентский парсер trainer-pull не должен отбрасывать sale_clips / ПНК / lifecycle.
 */
import { normalizeTrainerPullPayload } from '../src/lib/trainerPullResponseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeTrainerPullPayload(null) === null, 'null → null')
ok(normalizeTrainerPullPayload('x') === null, 'non-object → null')

const empty = normalizeTrainerPullPayload({})
ok(Array.isArray(empty.sale_clips) && empty.sale_clips.length === 0, 'missing sale_clips → []')
ok(Array.isArray(empty.pnk_funnel_events) && empty.pnk_funnel_events.length === 0, 'missing pnk → []')
ok(
  Array.isArray(empty.client_hall_lifecycle) && empty.client_hall_lifecycle.length === 0,
  'missing lifecycle → []',
)
ok(
  Array.isArray(empty.trainer_schedule_entries) && empty.trainer_schedule_entries.length === 0,
  'missing schedule → []',
)
ok(empty.club_id === null, 'missing club_id → null')
ok(empty.outreach_templates === undefined, 'missing outreach → undefined (не затирать кэш)')

const clip = {
  id: 'clip-1',
  trainer_id: 't1',
  status: 'awaiting',
  client_name: 'Иванов',
}
const full = normalizeTrainerPullPayload({
  clients: [{ id: 'c1' }],
  memberships: [{ id: 'm1' }],
  health_cards: [],
  body_measurements: [],
  client_weight_entries: [],
  trainings: [{ id: 'tr1' }],
  pnk_funnel_events: [{ id: 'e1' }],
  sale_clips: [clip],
  client_hall_lifecycle: [{ id: 'l1', client_id: 'c1' }],
  trainer_schedule_entries: [{ id: 's1', day_date: '2026-08-27' }],
  club_id: ' club-x ',
  outreach_templates: { sms: 'hi' },
  trainings_truncated: true,
  incremental: true,
  trainings_since: '2026-08-01',
})

ok(full.sale_clips.length === 1 && full.sale_clips[0].id === 'clip-1', 'sale_clips прокидываются')
ok(full.pnk_funnel_events.length === 1, 'pnk_funnel_events прокидываются')
ok(full.client_hall_lifecycle.length === 1, 'client_hall_lifecycle прокидывается')
ok(full.trainer_schedule_entries.length === 1, 'trainer_schedule_entries прокидывается')
ok(full.club_id === 'club-x', 'club_id trim')
ok(full.outreach_templates?.sms === 'hi', 'outreach_templates прокидываются')
ok(full.trainings_truncated === true && full.incremental === true, 'flags')
ok(full.clients.length === 1 && full.trainings.length === 1, 'clients/trainings')

/** Регрессия: узкий return как раньше — заявка на планшет терялась */
function legacyDropSideStores(data) {
  return {
    clients: Array.isArray(data.clients) ? data.clients : [],
    memberships: Array.isArray(data.memberships) ? data.memberships : [],
    health_cards: Array.isArray(data.health_cards) ? data.health_cards : [],
    body_measurements: Array.isArray(data.body_measurements) ? data.body_measurements : [],
    client_weight_entries: Array.isArray(data.client_weight_entries) ? data.client_weight_entries : [],
    trainings: Array.isArray(data.trainings) ? data.trainings : [],
    trainings_truncated: data.trainings_truncated === true,
    trainings_since: data.trainings_since ?? null,
    incremental: data.incremental === true,
  }
}
const dropped = legacyDropSideStores({ sale_clips: [clip], clients: [] })
ok(!('sale_clips' in dropped), 'legacy parser терял sale_clips (контраст)')
ok(normalizeTrainerPullPayload({ sale_clips: [clip] }).sale_clips[0].id === 'clip-1', 'fix держит sale_clips')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer-pull response checks passed')
