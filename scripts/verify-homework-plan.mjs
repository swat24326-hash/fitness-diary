import { HOMEWORK_PRESET_SEED } from '../src/lib/homework/homeworkPresetCatalog.js'
import {
  normalizeHomeworkItems,
  normalizeHomeworkPresetRow,
  shouldApplyRemoteHomeworkPresetRow,
  shouldDeleteLocalHomeworkPresetRow,
} from '../src/lib/homework/homeworkPresetsCore.js'
import {
  addExerciseToHomeworkDraft,
  applyHomeworkPresetToDraft,
  emptyHomeworkDraft,
  isHomeworkDraftReady,
  setHomeworkDraftComment,
} from '../src/lib/homework/homeworkPlanCore.js'
import {
  filterHomeworkExerciseCatalog,
  listHomeworkMuscleGroups,
  resolveHomeworkCatalogExercise,
} from '../src/lib/homework/homeworkCatalogFilter.js'
import { normalizeHomeworkPresetPushPayload } from '../src/lib/admin/homeworkPresetPushPayload.js'
import { enrichHomeworkBlocksWithCatalog } from '../src/lib/homework/homeworkPresetsCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(HOMEWORK_PRESET_SEED.length === 5, '5 seed presets')
ok(HOMEWORK_PRESET_SEED.every((p) => p.title && p.blocks?.length), 'seed presets have blocks')

const seed0 = HOMEWORK_PRESET_SEED[0]
const row = normalizeHomeworkPresetRow({
  id: 'hw-1',
  club_id: 'club-1',
  title: seed0.title,
  direction: seed0.direction,
  description: seed0.description,
  items: { blocks: seed0.blocks },
  sort_order: 0,
  is_active: true,
})
ok(row?.title === seed0.title, 'normalize preset row')
ok(row?.items?.blocks?.length > 0, 'preset blocks normalized')

const draft = applyHomeworkPresetToDraft(row)
ok(draft?.mode === 'preset', 'apply preset mode')
ok(isHomeworkDraftReady(draft), 'draft ready after preset')
ok(setHomeworkDraftComment(draft, '  Через день  ').comment === 'Через день', 'comment trim')

const catalog = [
  { id: 'e1', name: 'Приседания', muscle_group: 'Ноги', primary_muscles: 'квадрицепс' },
  { id: 'e2', name: 'Планка', muscle_group: 'Кор', primary_muscles: '' },
  { id: 'e3', name: 'Ягодичный мост', muscle_group: 'Ягодицы', primary_muscles: '' },
]
ok(listHomeworkMuscleGroups(catalog).length === 3, 'muscle groups')
ok(filterHomeworkExerciseCatalog(catalog, 'план', '').some((r) => r.id === 'e2'), 'filter by query')
ok(filterHomeworkExerciseCatalog(catalog, '', 'Ноги').length === 1, 'filter by group')
ok(resolveHomeworkCatalogExercise(catalog, 'Планка')?.id === 'e2', 'resolve by name')

let builder = emptyHomeworkDraft()
builder = addExerciseToHomeworkDraft(builder, {
  catalog_exercise_id: 'e1',
  name: 'Приседания',
  sets: 3,
  reps: '12',
  rest_sec: 45,
}, 'Ноги')
ok(builder.blocks.some((b) => b.exercises.some((ex) => ex.catalog_exercise_id === 'e1')), 'add catalog exercise')
ok(!addExerciseToHomeworkDraft(builder, { catalog_exercise_id: null, name: 'Своё', sets: 1, reps: '1', rest_sec: 0 }).blocks
  .flatMap((b) => b.exercises)
  .some((ex) => ex.name === 'Своё'), 'reject exercise without catalog id')

const push = normalizeHomeworkPresetPushPayload(row)
ok(push?.id === 'hw-1' && push.items?.blocks?.length, 'push payload')

ok(
  !shouldApplyRemoteHomeworkPresetRow({
    id: 'hw-1',
    forceFromCloud: false,
    pendingUpdates: new Set(['hw-1']),
    pendingInserts: new Set(),
  }),
  'skip remote while pending update',
)
ok(
  shouldDeleteLocalHomeworkPresetRow({
    id: 'gone',
    remoteIds: new Set(['hw-1']),
    forceFromCloud: true,
    pendingUpdates: new Set(),
    pendingInserts: new Set(),
  }),
  'delete local missing on force pull',
)

const items = normalizeHomeworkItems({
  blocks: [{ label: 'A', exercises: [{ name: 'X', sets: 2, reps: '8', rest_sec: 20 }] }],
})
ok(items.blocks[0].exercises[0].sets === 2, 'normalize items')

const enriched = enrichHomeworkBlocksWithCatalog(
  { blocks: [{ label: 'A', exercises: [{ name: 'Планка', sets: 2, reps: '20 сек', rest_sec: 30 }] }] },
  catalog,
)
ok(enriched.blocks[0].exercises[0].catalog_exercise_id === 'e2', 'enrich seed with catalog id')

process.exit(failed > 0 ? 1 : 0)
