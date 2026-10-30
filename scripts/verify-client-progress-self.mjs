/**
 * Вес/обмеры клиентом в /me: валидация, merge дня (клуб > ○), preview upsert.
 * node scripts/verify-client-progress-self.mjs
 */
import { buildClientProgress } from '../api/_lib/clientPortal/clientMeCore.js'
import {
  PROGRESS_CLUB_SOURCE,
  PROGRESS_SELF_SOURCE,
  clientCanEditProgressPoint,
  measureValuesToRow,
  parseSelfMeasureValues,
  parseSelfProgressDate,
  parseSelfWeightKg,
  previewDeleteWeight,
  previewUpsertWeight,
  progressPointOriginRu,
} from '../src/lib/client/clientProgressSelfCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

const TODAY = '2026-10-18'

ok(parseSelfProgressDate('2026-10-19', TODAY).ok === false, 'будущая дата — отказ')
ok(parseSelfProgressDate('2026-10-18', TODAY).ok === true, 'сегодня — ок')
ok(parseSelfWeightKg(19).ok === false, 'вес ниже минимума')
ok(parseSelfWeightKg(62.5).ok === true && parseSelfWeightKg('62,5').kg === 62.5, 'вес с запятой')
ok(parseSelfMeasureValues({ neck: 36 }).ok === true, 'один обмер — ок')
ok(parseSelfMeasureValues({}).ok === false, 'пустые обмеры — отказ')
ok(progressPointOriginRu('client') === 'вы внесли', 'подпись ○')
ok(progressPointOriginRu('club') === 'от клуба', 'подпись ●')

const merged = buildClientProgress(
  [{ id: 't1', date: '2026-10-10', status: 'completed', data: { pre_weight_kg: 70 } }],
  [
    { id: 'c1', date: '2026-10-10', weight_kg: 71, source: 'client' },
    { id: 'c2', date: '2026-10-12', weight_kg: 69.5, source: 'client' },
    { id: 'm1', date: '2026-10-05', weight_kg: 72, source: 'manual' },
  ],
  [
    { id: 'b1', date: '2026-09-01', neck: 35, source: 'club' },
    { id: 'b2', date: '2026-09-01', neck: 36, source: 'client' },
    { id: 'b3', date: '2026-10-01', waist_upper: 70, source: 'client' },
  ],
  TODAY,
)
ok(
  merged.weights.find((w) => w.date === '2026-10-10')?.source === PROGRESS_CLUB_SOURCE &&
    merged.weights.find((w) => w.date === '2026-10-10')?.kg === 70,
  'один день: тренировка (клуб) главнее клиентской ○',
)
ok(
  merged.weights.find((w) => w.date === '2026-10-12')?.source === PROGRESS_SELF_SOURCE &&
    merged.weights.find((w) => w.date === '2026-10-12')?.id === 'c2',
  'свой день — ○ с id',
)
ok(merged.weights.find((w) => w.date === '2026-10-05')?.source === PROGRESS_CLUB_SOURCE, 'manual — клуб')
ok(
  merged.measurements.find((m) => m.date === '2026-09-01')?.source === PROGRESS_CLUB_SOURCE,
  'обмеры: клуб главнее в тот же день',
)
ok(
  merged.measurements.find((m) => m.date === '2026-10-01')?.editable === true &&
    merged.measurements.find((m) => m.date === '2026-10-01')?.id === 'b3',
  'свои обмеры editable + id',
)
ok(clientCanEditProgressPoint({ source: 'client', id: 'x' }) === true, 'можно править свою')
ok(clientCanEditProgressPoint({ source: 'club' }) === false, 'клубную править нельзя')

const preview = previewUpsertWeight(
  { weights: [{ date: '2026-10-01', kg: 70, source: 'club' }] },
  { date: '2026-10-18', kg: 68 },
)
ok(preview.ok === true && preview.progress.weights.at(-1)?.source === 'client', 'preview upsert веса')
ok(
  previewDeleteWeight(preview.progress, preview.progress.weights.at(-1).id).progress.weights.every(
    (w) => w.source !== 'client',
  ),
  'preview delete',
)

const clubSameDay = previewUpsertWeight(
  { weights: [{ date: '2026-10-18', kg: 70, source: 'club' }] },
  { date: '2026-10-18', kg: 68 },
)
ok(clubSameDay.ok === false, 'preview: клубный день — отказ, не тихий no-op')
ok(clubSameDay.progress.weights.length === 1 && clubSameDay.progress.weights[0].source === 'club', 'прогресс не менялся')

ok(
  measureValuesToRow({ neck: 36 }).chest === undefined && measureValuesToRow({ neck: 36 }).neck === 36,
  'update обмеров не затирает чужие поля null',
)
ok(measureValuesToRow({ neck: 36 }, { fillMissingNull: true }).chest === null, 'insert — пустые поля null')

console.log('\nverify-client-progress-self: OK')
