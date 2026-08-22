import { buildHomeworkShareMessages } from '../src/lib/homework/homeworkShareCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const msgs = buildHomeworkShareMessages({
  draft: { title: 'Спина и пресс' },
  clubName: 'FIT-CITY Клинцы',
  clientName: 'Выборнова Елена Никolaevna',
  trainerName: 'Олег',
})
ok(msgs.shareTitle === 'FIT-CITY Клинцы · Спина и пресс', 'homework title with club')
ok(msgs.shareText.includes('для Елена'), 'homework greeting in full text')
ok(msgs.shareText.includes('на картинке'), 'homework text references image')
ok(!msgs.shareText.includes('во вложении'), 'no misleading attachment promise')
ok(msgs.shareTitle.length < msgs.shareText.length, 'Max caption shorter than other text')

const outreach = buildHomeworkShareMessages({
  draft: { title: 'Ноги' },
  client: { name: 'Выборнова Е.Н.', outreach_name: 'Лена' },
  clubName: 'FIT-CITY',
  trainerName: 'Олег',
})
ok(outreach.shareText.includes('для Лена'), 'homework outreach_name in text')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll homework share checks passed.')
