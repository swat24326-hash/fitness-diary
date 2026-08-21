/**
 * node scripts/verify-client-name-format.mjs
 */
import { formatClientName, isClientNameInitialsPart } from '../src/lib/clientNameFormat.js'
import { extractGreetingNameFromClientName } from '../src/lib/trainer/trainerClientOutreachCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(formatClientName('плетнёв роман') === 'Плетнёв Роман', 'surname + name')
ok(formatClientName('плетнёв роман александрович') === 'Плетнёв Роман Александрович', 'surname + name + patronymic')
ok(formatClientName('анна сергеевна') === 'Анна Сергеевна', 'name + patronymic')
ok(formatClientName('Плетнёв Р.А.') === 'Плетнёв Р.А.', 'surname + initials dotted')
ok(formatClientName('Плетнёв РА') === 'Плетнёв Р.А.', 'surname + RA uppercase')
ok(formatClientName('Плетнёв р а') === 'Плетнёв Р.А.', 'surname + spaced initials')
ok(formatClientName('готарова') === 'Готарова', 'surname only')
ok(formatClientName('QA Тест ТЗ Авто') === 'Qa Тест Тз Авто', 'TZ not initials')
ok(formatClientName('QA Тест АЗ Авто') === 'Qa Тест Аз Авто', 'AZ not initials')
ok(isClientNameInitialsPart('РА'), 'РА is initials')
ok(!isClientNameInitialsPart('ТЗ'), 'ТЗ is not initials')
ok(!isClientNameInitialsPart('Роман'), 'Роман is not initials')
ok(extractGreetingNameFromClientName('Плетнёв Роман Александрович') === 'Роман', 'greeting uses given name with patronymic')
ok(extractGreetingNameFromClientName('Плетнёв Р.А.') === '', 'greeting empty for initials')

if (failed) process.exit(1)
console.log('verify-client-name-format: all passed')
