/**
 * node scripts/verify-pz-trainings-report-import.mjs
 * Сценарии: матч имён, Excel→матрица, persist при пустом списке тренеров, UI «По клубу», повторная подстановка.
 */
import {
  canonicalizePzExcelTypeHeader,
  matchMembershipTypeByExcelHeader,
  matchTrainerByExcelName,
  normalizeTrainerNameKey,
  parsePzReportPeriodDate,
  parsePzTrainingsReportAoA,
  pzTrainingsReportDateMatches,
  trainerNameTokensKey,
} from '../src/lib/admin/pzTrainingsReportImportCore.js'
import {
  clubDisplayCountForType,
  hydrateTrainingsMatrixInputMap,
  isLikelyTrainerUuidLabel,
  mergeTrainersWithMatrixNames,
  matrixTrainerLabelsNeedEnrich,
  resolveTrainingsMatrixForPersist,
  SALES_TRAINING_CLUB_ID,
  SALES_TRAINING_TYPE_NONE,
  salesTrainingCellKey,
  sumTypedMatrixRows,
  trainerIdsFromTrainingsMatrixInput,
  trainingsMatrixHasTrainerDetail,
} from '../src/lib/admin/salesTrainingsMatrix.js'
import {
  mergeSalesTrainersForLabels,
  salesTrainerDisplayLabel,
  salesTrainerLabelsNeedEnrich,
  trainerIdsFromSalesDailyRows,
  unresolvedTrainerIdsForLabels,
} from '../src/lib/admin/salesTrainerLabelsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parsePzReportPeriodDate('Период: 05.08.2026 - 05.08.2026') === '2026-08-05', 'period date')
ok(parsePzReportPeriodDate('Период: 01.08.2026 - 31.08.2026') == null, 'month range is not one day')
ok(canonicalizePzExcelTypeHeader('.VIP 3') === 'vip3', 'vip3 header')
ok(canonicalizePzExcelTypeHeader('Brilliant') === 'br', 'br header')
ok(canonicalizePzExcelTypeHeader('см') === 'cm', 'cm header')
ok(canonicalizePzExcelTypeHeader('Итого') == null, 'skip итого')
ok(canonicalizePzExcelTypeHeader('СОТ') === 'cot', 'cyrillic СОТ → cot')
ok(canonicalizePzExcelTypeHeader('COT') === 'cot', 'latin COT → cot')
ok(canonicalizePzExcelTypeHeader('БЗ') === 'bz', 'cyrillic БЗ → bz')

const types = [
  { id: 't-vip3', code: 'Vip 3', trainer_assignable: true },
  { id: 't-vip2', code: 'Vip 2', trainer_assignable: true },
  { id: 't-vip1', code: 'Vip 1', trainer_assignable: true },
  { id: 't-br', code: 'Br', trainer_assignable: true },
  { id: 't-dm', code: 'Dm', trainer_assignable: true },
  { id: 't-el', code: 'El', trainer_assignable: true },
  { id: 't-cm', code: 'CM', trainer_assignable: true },
  { id: 't-cot', code: 'COT', trainer_assignable: true },
]
ok(matchMembershipTypeByExcelHeader('VIP 3', types)?.id === 't-vip3', 'match vip3')
ok(matchMembershipTypeByExcelHeader('.VIP', types)?.id === 't-vip1', 'match vip1')
ok(matchMembershipTypeByExcelHeader('  .Diamond', types)?.id === 't-dm', 'match diamond header')
ok(matchMembershipTypeByExcelHeader('СОТ', types)?.id === 't-cot', 'match cyrillic СОТ to latin COT')
ok(matchMembershipTypeByExcelHeader('COT', types)?.id === 't-cot', 'match latin COT')

const trainers = [
  { id: 'tr1', name: 'Житомирский Евгений' },
  { id: 'tr2', name: 'Кожемякина Анжелика' },
  { id: 'tr3', name: 'Евгений Житомирский' },
  { id: 'tr4', name: 'Анжелика Кожемякина' },
  { id: 'tr5', name: 'Дмитрий Семенов' },
]
ok(matchTrainerByExcelName('Житомирский  Евгений ', trainers)?.id === 'tr1', 'match trainer exact')
ok(matchTrainerByExcelName('Житомирский Евгений', [{ id: 'tr3', name: 'Евгений Житомирский' }])?.id === 'tr3', 'match reversed order')
ok(matchTrainerByExcelName('Семенов Дмитрий', [{ id: 'tr5', name: 'Дмитрий Семенов' }])?.id === 'tr5', 'match семенов reversed')
ok(matchTrainerByExcelName('Семёнов Дмитрий', [{ id: 'tr5', name: 'Дмитрий Семенов' }])?.id === 'tr5', 'match ё/е')
ok(
  matchTrainerByExcelName('Житомирский\u00a0\u00a0Евгений', [{ id: 'tr3', name: 'Евгений Житомирский' }])?.id ===
    'tr3',
  'match nbsp in excel name',
)
ok(matchTrainerByExcelName('Неизвестный', trainers) == null, 'unmatched trainer')
ok(trainerNameTokensKey('Иванов Иван') === trainerNameTokensKey('Иван Иванов'), 'tokens key order-free')
ok(normalizeTrainerNameKey('  А  Б  ') === 'а б', 'normalize spaces')

const axisLikeTrainers = [
  { id: 'a1', name: 'Евгений Житомирский' },
  { id: 'a2', name: 'Анжелика Кожемякина' },
  { id: 'a3', name: 'Кирилл Лисицын' },
  { id: 'a4', name: 'Дмитрий Семенов' },
  { id: 'a5', name: 'Светлана Филатова' },
  { id: 'a6', name: 'Захар Шкурат' },
  { id: 'a7', name: 'Роман Шутский' },
]

const realLikeAoa = [
  ['Параметры:', 'Период: 06.08.2026 - 06.08.2026'],
  ['Отбор:', 'Персональный зал'],
  [],
  ['Тренер', '    .VIP 3', '    VIP 2', '   .VIP', '   Brilliant', '  .Diamond', 'см', 'Итого'],
  ['', 'Кол занятий групп', 'Кол занятий групп', 'Кол занятий групп', 'Кол занятий групп', 'Кол занятий групп', 'Кол занятий групп', 'Кол занятий групп'],
  ['Житомирский  Евгений ', '', '', 3, '', '', '', 3],
  ['Кожемякина Анжелика ', 3, 1, '', '', '', '', 4],
  ['Лисицын Кирилл ', '', '', '', 1, '', '', 1],
  ['Семенов Дмитрий', '', 1, '', 2, '', '', 3],
  ['Филатова  Светлана ', '', '', 2, 5, '', '', 7],
  ['Шкурат Захар ', '', '', 6, '', 1, '', 7],
  ['Шутский Роман ', '', '', '', 4, 3, 1, 8],
  ['Итого', 3, 2, 11, 12, 4, 1, 33],
]
const realParsed = parsePzTrainingsReportAoA(realLikeAoa, {
  trainers: axisLikeTrainers,
  membershipTypes: types,
})
ok(realParsed.ok === true, 'real-like parse ok')
ok(realParsed.unmatchedTrainers.length === 0, `real-like all trainers matched (${realParsed.unmatchedTrainers.join(', ')})`)
ok(realParsed.matchedTotal === 33, `real-like matched total ${realParsed.matchedTotal}`)
ok(realParsed.fileTotal === 33, 'real-like file total')
ok(realParsed.matchedTrainers.length === 7, 'real-like 7 matched trainers')

const monthPz = parsePzTrainingsReportAoA(
  [
    ['Параметры:', 'Период: 01.08.2026 - 31.08.2026'],
    ['Тренер', 'VIP 3', 'Итого'],
    ['Житомирский Евгений', 1, 1],
  ],
  { trainers: axisLikeTrainers, membershipTypes: types },
)
ok(monthPz.ok === false && /период/i.test(String(monthPz.error || '')), 'PZ month file refused')

const aoa = [
  ['Параметры:', 'Период: 05.08.2026 - 05.08.2026'],
  ['Отбор:', 'Персональный зал'],
  [],
  ['Тренер', 'VIP 3', 'VIP 2', '.VIP', 'Brilliant', '.Diamond', 'Elite', 'см', 'Итого'],
  ['', 'Кол занятий', 'Кол занятий', 'Кол занятий', 'Кол занятий', 'Кол занятий', 'Кол занятий', 'Кол занятий', 'Кол занятий'],
  ['Житомирский  Евгений ', '', '', '3', '2', '', '', '', '5'],
  ['Кожемякина Анжелика ', '3', '4', '', '', '4', '', '', '11'],
  ['Чужой Тренер', '', '', '1', '', '', '', '', '1'],
  ['Итого', '3', '4', '4', '2', '4', '0', '0', '17'],
]

const parsed = parsePzTrainingsReportAoA(aoa, { trainers, membershipTypes: types })
ok(parsed.ok === true, 'parse ok')
ok(parsed.reportDate === '2026-08-05', 'parsed date')
ok(parsed.matchedTotal === 16, `matched total ${parsed.matchedTotal}`)
ok(parsed.unmatchedTrainers.some((n) => /Чужой/i.test(n)), 'unmatched trainer listed')
ok(pzTrainingsReportDateMatches(parsed.reportDate, '2026-08-05'), 'date match')
ok(!pzTrainingsReportDateMatches(parsed.reportDate, '2026-08-06'), 'date mismatch')

const sotAoa = [
  ['Параметры:', 'Период: 09.08.2026 - 09.08.2026'],
  [],
  ['Тренер', '4*', 'СОТ', 'Итого'],
  ['', 'Кол занятий групп', 'Кол занятий групп', 'Кол занятий групп'],
  ['Солоушкин Михаил', '4', '1', '5'],
  ['Итого', '4', '1', '5'],
]
const sotParsed = parsePzTrainingsReportAoA(sotAoa, {
  trainers: [{ id: 'tr-s', name: 'Солоушкин Михаил' }],
  membershipTypes: [
    { id: 't4', code: '4*', trainer_assignable: true },
    { id: 't-cot', code: 'COT', trainer_assignable: true },
  ],
})
ok(sotParsed.ok === true, 'СОТ file parse ok')
ok(sotParsed.unmatchedColumns.length === 0, `СОТ matched columns (${sotParsed.unmatchedColumns.join(',')})`)
ok(sotParsed.matchedTotal === 5, `СОТ matched total ${sotParsed.matchedTotal}`)
ok(sotParsed.fileTotal === 5, 'СОТ file total')

const resolvedNew = resolveTrainingsMatrixForPersist(parsed.matrixInput, ['tr1', 'tr2'], types)
ok(resolvedNew.ok === true, 'persist new ok')
ok(
  resolvedNew.rows.every((r) => r.trainer_id !== SALES_TRAINING_CLUB_ID),
  'new persist no club',
)
ok(sumTypedMatrixRows(resolvedNew.rows) === 16, 'new typed sum')

const oldMap = {
  [`${SALES_TRAINING_CLUB_ID}|t-vip1`]: '10',
  [`${SALES_TRAINING_CLUB_ID}|t-br`]: '5',
}
const resolvedOld = resolveTrainingsMatrixForPersist(oldMap, ['tr1', 'tr2'], types)
ok(resolvedOld.ok === true, 'persist old ok')
ok(
  resolvedOld.rows.length === 2 && resolvedOld.rows.every((r) => r.trainer_id === SALES_TRAINING_CLUB_ID),
  'old persist only club',
)

const mixedBoth = {
  ...oldMap,
  ...parsed.matrixInput,
}
const resolvedPreferNew = resolveTrainingsMatrixForPersist(mixedBoth, ['tr1', 'tr2'], types)
ok(
  resolvedPreferNew.ok &&
    resolvedPreferNew.rows.every((r) => r.trainer_id !== SALES_TRAINING_CLUB_ID) &&
    sumTypedMatrixRows(resolvedPreferNew.rows) === 16,
  'club+trainer input → only trainers (no double)',
)

const monthRows = [...resolvedOld.rows, ...resolvedNew.rows]
ok(sumTypedMatrixRows(monthRows) === 15 + 16, 'month old+new no double')

ok(!trainingsMatrixHasTrainerDetail(oldMap), 'old has no trainer detail')
ok(trainingsMatrixHasTrainerDetail(parsed.matrixInput), 'new has trainer detail')
ok(Object.keys(hydrateTrainingsMatrixInputMap(resolvedNew.rows)).length > 0, 'hydrate')

const emptyListPersist = resolveTrainingsMatrixForPersist(parsed.matrixInput, [], types)
ok(emptyListPersist.ok === true, 'persist empty trainer list ok')
ok(sumTypedMatrixRows(emptyListPersist.rows) === 16, 'persist empty list keeps 16')
ok(emptyListPersist.trainerIds.includes('tr1') && emptyListPersist.trainerIds.includes('tr2'), 'persist ids from matrix')
ok(trainerIdsFromTrainingsMatrixInput(parsed.matrixInput).sort().join() === 'tr1,tr2', 'ids from matrix keys')

ok(clubDisplayCountForType(parsed.matrixInput, [], 't-vip1') === 3, 'UI club total vip1 without trainer list')
ok(clubDisplayCountForType(parsed.matrixInput, [], 't-br') === 2, 'UI club total br without trainer list')
ok(
  clubDisplayCountForType(parsed.matrixInput, [], 't-vip3') +
    clubDisplayCountForType(parsed.matrixInput, [], 't-vip2') +
    clubDisplayCountForType(parsed.matrixInput, [], 't-vip1') +
    clubDisplayCountForType(parsed.matrixInput, [], 't-br') +
    clubDisplayCountForType(parsed.matrixInput, [], 't-dm') +
    clubDisplayCountForType(parsed.matrixInput, [], 't-el') +
    clubDisplayCountForType(parsed.matrixInput, [], 't-cm') ===
    16,
  'UI club typed sum 16 without trainer list',
)
ok(clubDisplayCountForType(oldMap, [], 't-vip1') === 10, 'UI old club mode vip1')

/** Повторная подстановка: второй apply заменяет карту, сумма та же. */
const secondApply = { ...parsed.matrixInput }
const secondPersist = resolveTrainingsMatrixForPersist(secondApply, [], types)
ok(secondPersist.ok && sumTypedMatrixRows(secondPersist.rows) === 16, 'second apply persist same 16')

/** После save→hydrate цикл не теряет часы. */
const roundTrip = hydrateTrainingsMatrixInputMap(emptyListPersist.rows)
ok(trainingsMatrixHasTrainerDetail(roundTrip), 'hydrate keeps trainer detail')
ok(sumTypedMatrixRows(resolveTrainingsMatrixForPersist(roundTrip, [], types).rows) === 16, 'round-trip persist 16')
ok(clubDisplayCountForType(roundTrip, [], 't-vip1') === 3, 'round-trip UI vip1')

/** Полный день как PZ.xlsx: 33 → persist при пустом списке → UI Итого 33. */
const realEmptyPersist = resolveTrainingsMatrixForPersist(realParsed.matrixInput, [], types)
ok(realEmptyPersist.ok && sumTypedMatrixRows(realEmptyPersist.rows) === 33, 'real-like persist 33 empty list')
const realUiTotal =
  clubDisplayCountForType(realParsed.matrixInput, [], 't-vip3') +
  clubDisplayCountForType(realParsed.matrixInput, [], 't-vip2') +
  clubDisplayCountForType(realParsed.matrixInput, [], 't-vip1') +
  clubDisplayCountForType(realParsed.matrixInput, [], 't-br') +
  clubDisplayCountForType(realParsed.matrixInput, [], 't-dm') +
  clubDisplayCountForType(realParsed.matrixInput, [], 't-cm')
ok(realUiTotal === 33, `real-like UI club typed sum ${realUiTotal}`)

/** Сценарий бага: тост 33, trainerIds=[], старый код писал 0 строк. */
ok(realEmptyPersist.rows.length > 0, 'bugfix: empty list still yields rows')
ok(
  !realEmptyPersist.rows.some((r) => r.trainer_id === SALES_TRAINING_CLUB_ID),
  'bugfix: no synthetic club rows when trainers in matrix',
)

ok(salesTrainingCellKey('a1', 't-vip1') === 'a1|t-vip1', 'cell key')
ok(salesTrainingCellKey('a1', null) === `a1|${SALES_TRAINING_TYPE_NONE}`, 'cell key none')
ok(salesTrainingCellKey(SALES_TRAINING_CLUB_ID, 't-br') === `${SALES_TRAINING_CLUB_ID}|t-br`, 'club cell key')

ok(isLikelyTrainerUuidLabel('63023a0d-1bb5-4428-b0f4-dab34d03fe9c'), 'uuid label detected')
ok(!isLikelyTrainerUuidLabel('Анжелика Кожемякина'), 'fio not uuid')
const uuidMatrix = {
  [`63023a0d-1bb5-4428-b0f4-dab34d03fe9c|t-vip1`]: '3',
}
ok(matrixTrainerLabelsNeedEnrich([], uuidMatrix), 'need enrich when no trainers')
ok(
  matrixTrainerLabelsNeedEnrich(
    [{ id: '63023a0d-1bb5-4428-b0f4-dab34d03fe9c', name: '63023a0d-1bb5-4428-b0f4-dab34d03fe9c' }],
    uuidMatrix,
  ),
  'need enrich when name is uuid',
)
const mergedNames = mergeTrainersWithMatrixNames(
  [],
  uuidMatrix,
  [{ id: '63023a0d-1bb5-4428-b0f4-dab34d03fe9c', name: 'Анжелика Кожемякина' }],
)
ok(mergedNames[0]?.name === 'Анжелика Кожемякина', 'merge puts fio on matrix id')
ok(!matrixTrainerLabelsNeedEnrich(mergedNames, uuidMatrix), 'enriched no longer needs enrich')

const monthOnlyId = 'a7334a0d-9c73-4f9b-b492-07059c6bb61b'
const monthRowsLabel = [
  {
    trainings_matrix: [{ trainer_id: monthOnlyId, membership_type_id: 't1', count: 4 }],
  },
]
ok(trainerIdsFromSalesDailyRows(monthRowsLabel).includes(monthOnlyId), 'month rows → trainer ids')
ok(
  salesTrainerLabelsNeedEnrich([{ id: 'active-1', name: 'Светлана' }], {}, monthRowsLabel),
  'stats need enrich for month-only trainer',
)
ok(
  unresolvedTrainerIdsForLabels([{ id: 'active-1', name: 'Светлана' }], [monthOnlyId]).includes(monthOnlyId),
  'unresolved lists month-only id',
)
const labeled = mergeSalesTrainersForLabels([{ id: 'active-1', name: 'Светлана' }], {
  monthRows: monthRowsLabel,
  nameCatalog: [{ id: monthOnlyId, name: 'Роман Шуцкий' }],
})
ok(
  labeled.some((t) => t.id === monthOnlyId && t.name === 'Роман Шуцкий'),
  'mergeSalesTrainersForLabels adds FIO for month id',
)
ok(salesTrainerDisplayLabel(monthOnlyId, null) === 'Тренер', 'display never raw uuid')
ok(salesTrainerDisplayLabel(monthOnlyId, { name: monthOnlyId }) === 'Тренер', 'display rejects uuid-as-name')
ok(salesTrainerDisplayLabel(monthOnlyId, { name: 'Роман Шуцкий' }) === 'Роман Шуцкий', 'display FIO')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll pz trainings report import checks passed')
