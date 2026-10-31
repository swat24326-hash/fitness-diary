/**
 * Подписи и группировка обмеров (node scripts/verify-body-measures.mjs).
 */
import {
  BODY_MEASURE_FIELDS,
  BODY_MEASURE_GROUPS,
  bodyMeasureFormRows,
  bodyMeasureLines,
  formatMeasureCm,
} from '../src/lib/bodyMeasures.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log('ok:', msg)
  else {
    console.error('FAIL:', msg)
    failed++
  }
}

const ids = BODY_MEASURE_FIELDS.map((f) => f.id)
const grouped = BODY_MEASURE_GROUPS.flatMap((g) => g.fields)
const lines = bodyMeasureLines()

ok(new Set(ids).size === ids.length, 'id полей уникальны')
ok(grouped.length === ids.length && grouped.every((id, i) => id === ids[i]), 'группы покрывают все поля по порядку')
ok(lines.length === BODY_MEASURE_GROUPS.length, 'строки экрана совпадают с группами')
ok(
  lines.filter((line) => line.cells.length > 1).every((line) => line.cells.every((cell) => cell.side)),
  'у парных параметров есть сторона',
)
ok(!BODY_MEASURE_FIELDS.some((f) => /\s[ПЛВН]$/.test(f.label)), 'в подписях нет сокращений П/Л/В/Н')
ok(lines.find((line) => line.id === 'arm')?.cells.map((cell) => cell.side).join('/') === 'правая/левая', 'рука: правая и левая')
ok(lines.find((line) => line.id === 'thigh')?.cells.map((cell) => cell.side).join('/') === 'правое/левое', 'бедро: правое и левое')
ok(lines.find((line) => line.id === 'waist')?.cells.map((cell) => cell.side).join('/') === 'верх/низ', 'талия: верх и низ')
ok(formatMeasureCm(32) === '32', 'целое без дроби')
ok(formatMeasureCm('32.5') === '32,5', 'десятые через запятую')
ok(formatMeasureCm(null) === null && formatMeasureCm('') === null, 'пустое значение не рисуем нулём')

const formRows = bodyMeasureFormRows()
const formFlat = formRows.flat().map((f) => f.id)
ok(formFlat.join(',') === ids.join(','), 'форма /me: все поля по порядку')
ok(
  formRows.some((row) => row.length === 2 && row[0].id === 'thigh_r' && row[1].id === 'thigh_l'),
  'форма /me: бёдра правое|левое в одном ряду',
)
ok(
  formRows.some((row) => row.length === 2 && row[0].id === 'arm_r' && row[1].id === 'arm_l'),
  'форма /me: руки правая|левая в одном ряду',
)
ok(
  formRows.some((row) => row.length === 2 && row[0].id === 'calf_r' && row[1].id === 'calf_l'),
  'форма /me: голени правая|левая в одном ряду',
)
ok(
  formRows.some((row) => row.length === 1 && row[0].id === 'glutes'),
  'форма /me: ягодицы отдельно, не сдвигают бёдра',
)

if (failed) process.exit(1)
console.log('body measures ok')
