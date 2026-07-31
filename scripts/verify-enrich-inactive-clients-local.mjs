import {
  enrichInactiveClientsFromLocal,
  inactiveClientsNeedLocalNameEnrichment,
} from '../src/lib/trainer/enrichInactiveClientsFromLocalCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(inactiveClientsNeedLocalNameEnrichment([{ id: '1', name: '—' }]), 'dash needs enrich')
ok(inactiveClientsNeedLocalNameEnrichment([{ id: '1', name: '' }]), 'empty needs enrich')
ok(!inactiveClientsNeedLocalNameEnrichment([{ id: '1', name: 'Иванов' }]), 'named ok')
ok(!inactiveClientsNeedLocalNameEnrichment([]), 'empty list no enrich')

const enriched = enrichInactiveClientsFromLocal(
  [
    { id: 'c1', name: '—', phone: null, inactiveDetail: 'нет абонемента' },
    { id: 'c2', name: 'Петров', phone: '111' },
  ],
  [
    { id: 'c1', name: 'Сидоров', phone: '+7900' },
    { id: 'c2', name: 'Петров', phone: '111' },
  ],
)

ok(enriched[0].name === 'Сидоров', 'fills name from local')
ok(enriched[0].phone === '+7900', 'fills phone from local')
ok(enriched[1].name === 'Петров', 'keeps good name')
ok(enriched[1].phone === '111', 'keeps good phone')

const unchanged = enrichInactiveClientsFromLocal(
  [{ id: 'c1', name: 'Иванов', phone: '1' }],
  [{ id: 'c1', name: 'Иванов', phone: '1' }],
)
ok(unchanged[0].name === 'Иванов', 'no rewrite when already named')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('verify-enrich-inactive-clients-local: all passed')
