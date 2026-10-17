/**
 * Текст тренировки для буфера (Whoop Import using AI).
 * node scripts/verify-client-training-copy.mjs
 */
import {
  buildClientTrainingCopyText,
  formatSetLineForCopy,
} from '../src/lib/client/clientTrainingCopyCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(formatSetLineForCopy({ weight_kg: '80', reps: '5' }) === '80 кг × 5', 'set: weight × reps')
ok(formatSetLineForCopy({ weight_kg: '40' }) === '40 кг', 'set: weight only')
ok(formatSetLineForCopy({ reps: '12' }) === '12 повт.', 'set: reps only')
ok(formatSetLineForCopy({ tut_sec: '10', load: '5' }, 'Кардио').includes('10'), 'set: cardio')

const text = buildClientTrainingCopyText({
  date: '2026-10-17',
  type: 'Силовая',
  data: {
    training_focus: 'Грудь',
    exercises: [
      {
        name: 'Жим лёжа',
        format: 'Силовая',
        sets: [
          { weight_kg: '80', reps: '5' },
          { weight_kg: '80', reps: '5' },
        ],
      },
      { name: 'Присед', format: 'Силовая', sets: [{ weight_kg: '100', reps: '5' }] },
    ],
  },
})
ok(text.includes('Тренировка'), 'copy: header')
ok(text.includes('Жим лёжа'), 'copy: exercise name')
ok(text.includes('80 кг × 5'), 'copy: set line')
ok(text.includes('Присед'), 'copy: second exercise')
ok(!text.includes('тренер') && !text.toLowerCase().includes('comment'), 'copy: no trainer notes')
ok(buildClientTrainingCopyText({ date: '2026-10-17', data: {} }) === '', 'copy: empty without exercises')
ok(buildClientTrainingCopyText(null) === '', 'copy: null')

console.log('verify-client-training-copy: all ok')
