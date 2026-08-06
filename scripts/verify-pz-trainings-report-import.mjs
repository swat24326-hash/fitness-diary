/**
 * node scripts/verify-pz-trainings-report-import.mjs
 */
import {
  canonicalizePzExcelTypeHeader,
  matchMembershipTypeByExcelHeader,
  matchTrainerByExcelName,
  parsePzReportPeriodDate,
  parsePzTrainingsReportAoA,
  pzTrainingsReportDateMatches,
} from '../src/lib/admin/pzTrainingsReportImportCore.js'
import {
  hydrateTrainingsMatrixInputMap,
  resolveTrainingsMatrixForPersist,
  SALES_TRAINING_CLUB_ID,
  sumTypedMatrixRows,
  trainingsMatrixHasTrainerDetail,
} from '../src/lib/admin/salesTrainingsMatrix.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parsePzReportPeriodDate('Период: 05.08.2026 - 05.08.2026') === '2026-08-05', 'period date')
ok(canonicalizePzExcelTypeHeader('.VIP 3') === 'vip3', 'vip3 header')
ok(canonicalizePzExcelTypeHeader('Brilliant') === 'br', 'br header')
ok(canonicalizePzExcelTypeHeader('см') === 'cm', 'cm header')
ok(canonicalizePzExcelTypeHeader('Итого') == null, 'skip итого')

const types = [
  { id: 't-vip3', code: 'Vip 3', trainer_assignable: true },
  { id: 't-vip2', code: 'Vip 2', trainer_assignable: true },
  { id: 't-vip1', code: 'Vip 1', trainer_assignable: true },
  { id: 't-br', code: 'Br', trainer_assignable: true },
  { id: 't-dm', code: 'Dm', trainer_assignable: true },
  { id: 't-el', code: 'El', trainer_assignable: true },
  { id: 't-cm', code: 'CM', trainer_assignable: true },
]
ok(matchMembershipTypeByExcelHeader('VIP 3', types)?.id === 't-vip3', 'match vip3')
ok(matchMembershipTypeByExcelHeader('.VIP', types)?.id === 't-vip1', 'match vip1')

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
ok(matchTrainerByExcelName('Неизвестный', trainers) == null, 'unmatched trainer')

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

ok(
  resolveTrainingsMatrixForPersist(parsed.matrixInput, [], types).ok &&
    sumTypedMatrixRows(resolveTrainingsMatrixForPersist(parsed.matrixInput, [], types).rows) === 16,
  'persist from matrix ids when trainer list empty',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll pz trainings report import checks passed')
