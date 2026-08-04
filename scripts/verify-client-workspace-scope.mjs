/**
 * node scripts/verify-client-workspace-scope.mjs
 */
import {
  buildClientCardNavSeed,
  clientCardUsesGlanceLocal,
  clientWorkspaceIncludes,
  clientWorkspaceScopeForClient,
  normalizeClientWorkspaceScope,
} from '../src/lib/admin/clientWorkspaceScopeCore.js'
import {
  adminClientsListMemoryTtlMs,
  invalidateAdminClientsListMemory,
  isAdminClientsListMemoryFresh,
  peekAdminClientsListMemory,
  writeAdminClientsListMemory,
} from '../src/lib/admin/adminClientsListMemoryCache.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeClientWorkspaceScope('glance') === 'glance', 'scope glance')
ok(normalizeClientWorkspaceScope('full') === 'full', 'scope full')
ok(normalizeClientWorkspaceScope('') === 'full', 'scope default full')
ok(normalizeClientWorkspaceScope('x') === 'full', 'scope unknown → full')

ok(clientWorkspaceScopeForClient({ desk_hall: 'tz' }) === 'glance', 'tz → glance')
ok(clientWorkspaceScopeForClient({ desk_hall: 'az' }) === 'glance', 'az → glance')
ok(clientWorkspaceScopeForClient({ desk_hall: null, trainer_id: 't1' }) === 'full', 'pz → full')
ok(clientWorkspaceScopeForClient({ desk_hall: null }, { litePz: true }) === 'glance', 'lite-pz → glance')
ok(
  clientWorkspaceScopeForClient({ desk_hall: 'tz' }, { litePz: false }) === 'glance',
  'desk wins over non-lite',
)
ok(clientCardUsesGlanceLocal({ desk_hall: null }, { litePz: true }), 'usesGlance lite')
ok(!clientCardUsesGlanceLocal({ desk_hall: null, trainer_id: 't1' }), 'usesGlance full pz')

const g = clientWorkspaceIncludes('glance')
ok(g.memberships && !g.trainings && !g.health_card, 'glance includes')
const f = clientWorkspaceIncludes('full')
ok(f.memberships && f.trainings && f.health_card, 'full includes')

const seed = buildClientCardNavSeed({
  id: 'c1',
  name: 'Test',
  phone: '1',
  desk_hall: 'tz',
  club_id: 'club',
})
ok(seed?.id === 'c1' && seed.desk_hall === 'tz' && seed.name === 'Test', 'nav seed')
ok(buildClientCardNavSeed(null) == null, 'seed null')

invalidateAdminClientsListMemory()
ok(peekAdminClientsListMemory('club-a') == null, 'memory empty')
writeAdminClientsListMemory('club-a', {
  clients: [{ id: '1', name: 'A' }],
  memByClient: { 1: [] },
  trainerNameById: { t1: 'Тренер' },
  noTabletTrainerIds: ['t2'],
  truncated: false,
  source: 'local',
})
const mem = peekAdminClientsListMemory('club-a')
ok(mem?.clients?.[0]?.id === '1' && mem.trainerNameById.t1 === 'Тренер', 'memory peek same club')
ok(peekAdminClientsListMemory('club-b') == null, 'memory other club miss')
ok(isAdminClientsListMemoryFresh(Date.now() - 1000), 'memory fresh')
ok(!isAdminClientsListMemoryFresh(Date.now() - adminClientsListMemoryTtlMs() - 1), 'memory stale')
invalidateAdminClientsListMemory('club-a')
ok(peekAdminClientsListMemory('club-a') == null, 'memory invalidate')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll client workspace scope checks passed')
