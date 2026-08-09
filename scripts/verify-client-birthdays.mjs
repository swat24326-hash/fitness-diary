import {
  daysUntilNextBirthday,
  formatBirthdayCountdown,
  isBirthdayWithinNextDays,
  isBirthdayBrowseMatch,
  partitionBirthdayBrowseClients,
  sortClientsForBirthdayBrowse,
  withBirthdayBrowseSectionBreaks,
  birthdayBrowseSectionKey,
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

check(isBirthdayBrowseMatch('1990-05-20', today), 'browse includes today')
check(isBirthdayBrowseMatch('1990-06-01', today), 'browse includes within 30')
check(!isBirthdayBrowseMatch('1990-07-01', today), 'browse excludes beyond 30')

const people = [
  { id: 't', name: 'Сегодня', birth_date: '1990-05-20' },
  { id: 'u', name: 'Скоро', birth_date: '1990-05-25' },
  { id: 'f', name: 'Далеко', birth_date: '1990-08-01' },
]
const parts = partitionBirthdayBrowseClients(people, today)
check(parts.today.map((c) => c.id).join(',') === 't', 'partition today')
check(parts.upcoming.map((c) => c.id).join(',') === 'u', 'partition upcoming only window')

const sorted = sortClientsForBirthdayBrowse(
  people.filter((c) => isBirthdayBrowseMatch(c.birth_date, today)),
  today,
)
check(sorted.map((c) => c.id).join(',') === 't,u', 'sort today then upcoming')
check(birthdayBrowseSectionKey('1990-05-20', today) === 'today', 'section today')
check(birthdayBrowseSectionKey('1990-05-25', today) === 'upcoming', 'section upcoming')

const withBreaks = withBirthdayBrowseSectionBreaks(sorted, today, { today: 1, upcoming: 1 })
check(
  withBreaks[0].type === 'section' && withBreaks[0].key === 'today' && withBreaks[0].count === 1,
  'section header today',
)
check(withBreaks[1].type === 'client' && withBreaks[1].client.id === 't', 'client after today header')
check(withBreaks[2].type === 'section' && withBreaks[2].key === 'upcoming', 'section header upcoming')
check(withBreaks[3].type === 'client' && withBreaks[3].client.id === 'u', 'client after upcoming header')

if (failed) {
  console.error(`\n${failed} birthday check(s) failed`)
  process.exit(1)
}
console.log('\nAll client-birthday checks passed.')
