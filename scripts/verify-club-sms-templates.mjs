/**
 * node scripts/verify-club-sms-templates.mjs
 */
import {
  clubSmsDefaultLooksLikeCoachVoice,
  defaultClubSmsTemplates,
  parseStoredClubSmsTemplates,
  resolveClubSmsTemplates,
  validateClubSmsTemplatesForSave,
} from '../src/lib/admin/clubSmsTemplatesCore.js'
import { defaultOutreachTemplates } from '../src/lib/trainer/trainerClientOutreachCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const club = defaultClubSmsTemplates()
const coach = defaultOutreachTemplates()

ok(Boolean(club.expiring && club.stale), 'club defaults present')
ok(!clubSmsDefaultLooksLikeCoachVoice(club.expiring), 'club expiring not coach voice')
ok(!clubSmsDefaultLooksLikeCoachVoice(club.birthdays), 'club birthday not coach voice')
ok(clubSmsDefaultLooksLikeCoachVoice(coach.expiring), 'coach expiring is coach voice')
ok(club.expiring.includes('{club_name}'), 'club expiring has club_name')
ok(!club.expiring.includes('Это твой тренер'), 'no trainer claim in club expiring')

ok(resolveClubSmsTemplates(null).expiring === club.expiring, 'resolve null → defaults')
ok(parseStoredClubSmsTemplates(null) == null, 'parse null')
ok(parseStoredClubSmsTemplates({ expiring: 'x {client_name} {club_name} {membership_name} {days_left} {days_word}' }) != null, 'parse custom')

const bad = validateClubSmsTemplatesForSave({
  ...club,
  expiring: 'без плейсхолдеров',
})
ok(!bad.ok, 'validate rejects missing placeholders')

const good = validateClubSmsTemplatesForSave({
  ...club,
  expiring: 'Привет, {client_name}! Это {club_name}. Карта {membership_name} — {days_left} {days_word}.',
})
ok(good.ok && good.templates != null, 'validate accepts custom club')

const same = validateClubSmsTemplatesForSave(club)
ok(same.ok && same.templates == null, 'defaults store as null')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-club-sms-templates: all passed')
