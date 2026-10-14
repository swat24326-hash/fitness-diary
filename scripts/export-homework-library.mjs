/**
 * Выгрузка библиотеки домашних упражнений в CSV для просмотра тренером (открывается в Excel).
 * Usage: node scripts/export-homework-library.mjs [путь.csv]   (по умолчанию homework-library.csv)
 */
import { writeFileSync } from 'node:fs'
import {
  HOMEWORK_LIBRARY,
  homeworkDumbbellNote,
  homeworkEntryPhases,
} from '../src/lib/homework/library/homeworkLibrary.js'
import {
  HOMEWORK_AVOID,
  HOMEWORK_EQUIPMENT,
  HOMEWORK_FOCUS,
  HOMEWORK_GOALS,
  HOMEWORK_LEVELS,
  HOMEWORK_PATTERNS,
  HOMEWORK_PHASES,
  HOMEWORK_UNITS,
} from '../src/lib/homework/library/homeworkLibraryTags.js'

const out = process.argv[2] || 'homework-library.csv'
const byId = new Map(HOMEWORK_LIBRARY.map((e) => [e.id, e]))
const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const labels = (keys, dict) => keys.map((k) => dict[k]).join(', ')

const header = ['id', 'Упражнение', 'Движение', 'Часть занятия', 'Уровень', 'Инвентарь', 'Если нет гантелей', 'Единица', 'На каждую сторону', 'Прыжки', 'Нельзя при', 'Цели', 'Акцент', 'Как выполнять', 'Главное в технике']
const rows = HOMEWORK_LIBRARY.map((e) => [
  e.id,
  e.name,
  HOMEWORK_PATTERNS[e.pattern],
  labels(homeworkEntryPhases(e), HOMEWORK_PHASES),
  HOMEWORK_LEVELS[e.level],
  HOMEWORK_EQUIPMENT[e.equip],
  homeworkDumbbellNote(e, byId),
  HOMEWORK_UNITS[e.unit],
  e.side ? 'да' : '',
  e.impact ? 'да' : '',
  labels(e.avoid, HOMEWORK_AVOID),
  labels(e.goals, HOMEWORK_GOALS),
  HOMEWORK_FOCUS[e.focus],
  e.how,
  e.cue,
])

const csv = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
writeFileSync(out, `\uFEFF${csv}\r\n`, 'utf8')
console.log(`Записано ${rows.length} упражнений в ${out}`)
