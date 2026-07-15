/**
 * node scripts/verify-trainer-client-outreach.mjs
 */
import {
  applyClientNamePlaceholder,
  buildMaxShareUrl,
  buildOutreachMessage,
  daysWordRu,
  defaultOutreachTemplates,
  extractGreetingNameFromClientName,
  isBirthdayToday,
  isMembershipExpiredRecently,
  isNameInitialsToken,
  normalizePhoneDigits,
  resolveClientGreetingName,
  resolveOutreachTemplates,
  validateOutreachTemplatesForSave,
} from '../src/lib/trainer/trainerClientOutreachCore.js'
import { membershipSignal } from '../src/lib/clientListSignals.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isNameInitialsToken('Р.А.'), 'initials Р.А.')
ok(isNameInitialsToken('Р.'), 'initials Р.')
ok(!isNameInitialsToken('Роман'), 'Роман is full name')
ok(extractGreetingNameFromClientName('Плетнёв Роман') === 'Роман', 'second word given name')
ok(extractGreetingNameFromClientName('Плетнёв Р.А.') === '', 'initials → no greeting name')
ok(extractGreetingNameFromClientName('Плетнёв') === '', 'surname only → no greeting name')
ok(resolveClientGreetingName({ name: 'Плетнёв Р.А.', outreach_name: 'Роман' }) === 'Роман', 'outreach_name override')
ok(resolveClientGreetingName({ name: 'Готарова А.В.' }) === '', 'initials without override')
ok(applyClientNamePlaceholder('Привет, {client_name}! Это тренер.', '') === 'Привет! Это тренер.', 'strip name from greeting')
ok(applyClientNamePlaceholder('Привет, {client_name}! Это тренер.', 'Роман') === 'Привет, Роман! Это тренер.', 'keep name in greeting')

ok(daysWordRu(1) === 'день' && daysWordRu(2) === 'дня' && daysWordRu(5) === 'дней', 'daysWordRu')

const today = '2026-07-15'
ok(isBirthdayToday('1990-07-15', today), 'birthday today')
ok(!isBirthdayToday('1990-07-16', today), 'not birthday tomorrow')

const expiringMem = [{ start_date: '2026-01-01', end_date: '2026-07-17', total_trainings: 10, used_trainings: 2 }]
ok(membershipSignal(expiringMem, today).key === 'expiring', 'expiring in 2 days')

const expiredYesterday = [{ start_date: '2026-01-01', end_date: '2026-07-14', total_trainings: 10, used_trainings: 10 }]
ok(isMembershipExpiredRecently(expiredYesterday, today), 'expired yesterday')
ok(!isMembershipExpiredRecently([{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 10, used_trainings: 10 }], today), 'not recent expired')

const birthdayMsg = buildOutreachMessage('birthdays', {
  clientName: 'Иванов Иван',
  trainerName: 'Алексей',
  clubName: 'Спорт Лайф',
  today,
})
ok(birthdayMsg.includes('Иван'), 'birthday uses given name not surname')
ok(!birthdayMsg.includes('Привет, Иванов'), 'not greeting with surname')
ok(birthdayMsg.includes('Спорт Лайф'), 'birthday uses club name')
ok(!birthdayMsg.includes('FIT-CITY'), 'no hardcoded FIT-CITY')
ok(birthdayMsg.includes('следующую тренировку'), 'next training not holiday')
ok(!/празднич/i.test(birthdayMsg), 'no holiday wording')
ok(!/рад[а]?\b|поздравлял/i.test(birthdayMsg), 'gender neutral birthday')

const noNameMsg = buildOutreachMessage('stale', {
  client: { name: 'Готарова А.В.' },
  trainerName: 'Роман',
  clubName: 'FIT CITY',
  today,
})
ok(noNameMsg.startsWith('Привет!'), 'no given name → Привет! without comma name')
ok(!noNameMsg.includes('Готарова'), 'surname not in greeting')

const expiringMsg = buildOutreachMessage('expiring', {
  clientName: 'Плетнёв Мария',
  trainerName: 'Алексей',
  clubName: 'Спорт Лайф',
  membershipName: 'Gold',
  memList: [{ start_date: '2026-01-01', end_date: '2026-07-18', total_trainings: 10, used_trainings: 1 }],
  today,
})
ok(expiringMsg.includes('Мария') && expiringMsg.includes('Gold') && expiringMsg.includes('3'), 'expiring membership and days')

ok(normalizePhoneDigits('+7 (999) 123-45-67') === '79991234567', 'phone normalize')
ok(buildMaxShareUrl('Привет').startsWith('https://max.ru/:share?text='), 'max share url')

const custom = validateOutreachTemplatesForSave({
  birthdays: 'Привет, {client_name}! Клуб {club_name}. Тренер {trainer_name}.',
  expiring: 'Hi {client_name} {trainer_name} {membership_name} {days_left} {days_word}',
  expired_recent: 'Hi {client_name} {trainer_name}',
  stale: 'Hi {client_name} {trainer_name} {club_name}',
})
ok(custom.ok, 'custom templates valid')

const bad = validateOutreachTemplatesForSave({
  birthdays: 'Без плейсхолдеров',
})
ok(!bad.ok, 'reject template without placeholders')

const defaults = defaultOutreachTemplates()
const resolved = resolveOutreachTemplates(null)
ok(resolved.birthdays === defaults.birthdays, 'defaults when null stored')

if (failed) process.exit(1)
console.log('verify-trainer-client-outreach: all passed')
