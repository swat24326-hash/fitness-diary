import {
  daysUntilNextBirthday,
  formatBirthdayCountdown,
  isBirthdayWithinNextDays,
} from '../src/lib/clientBirthdays.js'

let failed = 0

function check(cond, label) {
  if (cond) console.log('ok:', label)
  else {
    console.error('fail:', label)
    failed++
  }
}

const today = '2026-05-20'

check(daysUntilNextBirthday('1990-05-20', today) === 0, 'birthday today')
check(daysUntilNextBirthday('1990-05-21', today) === 1, 'birthday tomorrow')
check(daysUntilNextBirthday('1990-05-19', today) === 364, 'birthday yesterday -> next year')
check(isBirthdayWithinNextDays('1990-06-19', today, 30), 'within 30 days')
check(!isBirthdayWithinNextDays('1990-06-20', today, 30), '31 days out')
check(formatBirthdayCountdown(0) === 'сегодня', 'label today')
check(formatBirthdayCountdown(2) === 'через 2 дн.', 'label in 2 days')

if (failed) {
  console.error(`\n${failed} birthday check(s) failed`)
  process.exit(1)
}
console.log('\nAll client-birthday checks passed.')
