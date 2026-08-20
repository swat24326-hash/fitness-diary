/**
 * Archive-only trainer-pull не должен стирать живых клиентов из кэша
 * (симптом: Активные 0 после вкладки Архив при слабой сети).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  planTrainerOrphanClientPrune,
  shouldPruneTrainerPullSideEffects,
  simulateTrainerActiveThenArchivePull,
} from '../src/lib/trainerPullClientPruneCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

const local = [
  { id: 'a1', name: 'Живой', archived_at: null },
  { id: 'a2', name: 'Ещё живой' },
  { id: 'arch1', name: 'В архиве', archived_at: '2026-08-01T10:00:00Z' },
  { id: 'arch2', name: 'Старый архив', archived_at: '2026-07-01T10:00:00Z' },
]

const activeRemote = [
  { id: 'a1', archived_at: null },
  { id: 'a2' },
]
const archiveRemote = [{ id: 'arch1', archived_at: '2026-08-01T10:00:00Z' }]
const allRemote = [...activeRemote, ...archiveRemote]

const pruneActive = planTrainerOrphanClientPrune(local, activeRemote, new Set(), { mode: 'active' })
ok(!pruneActive.includes('a1') && !pruneActive.includes('a2'), 'active pull keeps live clients in remote')
ok(!pruneActive.includes('arch1') && !pruneActive.includes('arch2'), 'active pull preserves local archived')
ok(pruneActive.length === 0, 'active pull: no prune when live match + archived preserved')

const pruneArchive = planTrainerOrphanClientPrune(local, archiveRemote, new Set(), { mode: 'archive' })
ok(!pruneArchive.includes('a1') && !pruneArchive.includes('a2'), 'archive pull MUST NOT prune live clients')
ok(pruneArchive.includes('arch2'), 'archive pull prunes archived not in remote')
ok(!pruneArchive.includes('arch1'), 'archive pull keeps archived in remote')

const pruneEmptyArchive = planTrainerOrphanClientPrune(local, [], new Set(), { mode: 'archive' })
ok(
  pruneEmptyArchive.includes('arch1') && pruneEmptyArchive.includes('arch2'),
  'empty archive remote prunes all archived',
)
ok(!pruneEmptyArchive.includes('a1') && !pruneEmptyArchive.includes('a2'), 'empty archive remote keeps live')

const pruneAll = planTrainerOrphanClientPrune(local, allRemote, new Set(), { mode: 'all' })
ok(pruneAll.includes('arch2'), 'all pull prunes missing archived')
ok(!pruneAll.includes('a1') && !pruneAll.includes('arch1'), 'all pull keeps remote ids')

const pending = new Set(['arch2'])
const prunePending = planTrainerOrphanClientPrune(local, archiveRemote, pending, { mode: 'archive' })
ok(!prunePending.includes('arch2'), 'pending sync client not pruned')

const sideArchive = shouldPruneTrainerPullSideEffects('archive')
ok(sideArchive.pruneTrainings === false && sideArchive.purgeSyncQueue === false, 'archive: no trainings/queue wipe')

const sideActive = shouldPruneTrainerPullSideEffects('active')
ok(sideActive.pruneTrainings === false && sideActive.purgeSyncQueue === false, 'active: no side prune')

const sideAll = shouldPruneTrainerPullSideEffects('all')
ok(sideAll.pruneTrainings === true && sideAll.purgeSyncQueue === true, 'all: full side prune')

const sideTrunc = shouldPruneTrainerPullSideEffects('all', { trainingsTruncated: true })
ok(sideTrunc.pruneTrainings === false && sideTrunc.purgeSyncQueue === false, 'truncated: no side wipe')

const sideUnknown = shouldPruneTrainerPullSideEffects('weird')
ok(sideUnknown.pruneTrainings === false && sideUnknown.purgeSyncQueue === false, 'unknown mode: safe no side wipe')

// Сценарий зала: Активные → Архив → Активные (слабая сеть)
const sim = simulateTrainerActiveThenArchivePull(local, activeRemote, archiveRemote)
ok(sim.liveAfterArchive.includes('a1') && sim.liveAfterArchive.includes('a2'), 'sim: live survive archive pull')
ok(sim.afterArchive.includes('arch1'), 'sim: archive client remains')
ok(!sim.afterArchive.includes('arch2'), 'sim: stale archived pruned')

// Старый баг: archive prune как active (preserveArchived only)
const legacyBug = planTrainerOrphanClientPrune(local, archiveRemote, new Set(), { mode: 'active' })
ok(legacyBug.includes('a1') || legacyBug.includes('a2'), 'legacy active-mode on archive remote WOULD wipe live')

const pullSrc = read('src/lib/trainerPullService.js')
ok(/planTrainerOrphanClientPrune/.test(pullSrc), 'trainerPullService uses planTrainerOrphanClientPrune')
ok(/shouldPruneTrainerPullSideEffects/.test(pullSrc), 'trainerPullService uses side-effect gate')
ok(/enqueueTrainerPull|trainerPullChain/.test(pullSrc), 'trainer pulls serialized (no parallel IDB wipe)')
ok(/mode:\s*mode/.test(pullSrc) || /\{ mode \}/.test(pullSrc), 'prune called with mode')

const uiSrc = read('src/pages/trainer/TrainerClients.jsx')
ok(/mode:\s*'archive'/.test(uiSrc), 'TrainerClients archive tab pulls archive')
ok(/mode:\s*'active'/.test(uiSrc) && /archivedClients\.length === 0/.test(uiSrc), 'recovery pull when Active 0 + Archive N')
ok(/cancelled/.test(uiSrc), 'archive/active pulls honour cancel on tab switch')

const adminSrc = read('src/lib/admin/adminClientsListService.js')
ok(
  /mode === 'active' \? await reconcileAdminClubCache/.test(adminSrc),
  'admin: prune only on active pull (archive merge-only)',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer archive-pull prune checks passed')
