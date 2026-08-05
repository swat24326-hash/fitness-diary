/**
 * node scripts/verify-moi-zvonki-club-config.mjs
 */
import {
  isMoiZvonkiConfigComplete,
  mergeMoiZvonkiClubConfigForStore,
  normalizeMoiZvonkiApiBase,
  parseStoredMoiZvonkiClubConfig,
  resolveMoiZvonkiConfig,
  shapeMoiZvonkiPublicStatus,
  validateMoiZvonkiClubConfigForSave,
} from '../src/lib/admin/moiZvonkiClubConfigCore.js'
import { getMoiZvonkiConfigFromEnv } from '../api/_lib/moiZvonkiCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeMoiZvonkiApiBase('fitcity') === 'https://fitcity.moizvonki.ru/api/v1', 'domain → base')
ok(
  normalizeMoiZvonkiApiBase('https://x.moizvonki.ru/api/v1/') === 'https://x.moizvonki.ru/api/v1',
  'strip slash',
)

const club = parseStoredMoiZvonkiClubConfig({
  api_key: 'k1',
  user_email: 'a@b.ru',
  api_base: 'https://club.moizvonki.ru/api/v1',
})
ok(isMoiZvonkiConfigComplete(club), 'club complete')

const env = getMoiZvonkiConfigFromEnv({
  MOIZVONKI_DOMAIN: 'envclub',
  MOIZVONKI_API_KEY: 'ek',
  MOIZVONKI_USER_EMAIL: 'e@e.ru',
})

const fromClub = resolveMoiZvonkiConfig({ clubStored: club, envConfig: env })
ok(fromClub.source === 'club' && fromClub.apiKey === 'k1', 'prefer club over env')

const fromEnv = resolveMoiZvonkiConfig({ clubStored: null, envConfig: env })
ok(fromEnv.source === 'env' && fromEnv.userEmail === 'e@e.ru', 'env fallback')

const merge = resolveMoiZvonkiConfig({
  clubStored: { user_email: 'c@c.ru', api_base: 'clubdom' },
  envConfig: env,
})
ok(merge.source === 'merge' && merge.apiKey === 'ek' && merge.userEmail === 'c@c.ru', 'field merge')

const pub = shapeMoiZvonkiPublicStatus(fromClub)
ok(pub.configured && pub.has_api_key && !('api_key' in pub), 'public no raw key')
ok(String(pub.user_email_masked).includes('***'), 'email masked')

const bad = validateMoiZvonkiClubConfigForSave({ user_email: 'a@b.ru' })
ok(!bad.ok, 'save needs base')

const good = validateMoiZvonkiClubConfigForSave({
  user_email: 'a@b.ru',
  domain: 'fitcity',
  api_key: 'secret',
})
ok(good.ok && good.patch.api_base.includes('fitcity'), 'save ok')

const keep = validateMoiZvonkiClubConfigForSave({
  user_email: 'a@b.ru',
  api_base: 'https://fitcity.moizvonki.ru/api/v1',
})
ok(keep.ok && keep.patch.api_key === undefined, 'save without key keeps previous')

const stored = mergeMoiZvonkiClubConfigForStore(
  { api_key: 'old', user_email: 'o@o.ru', api_base: 'https://old.moizvonki.ru/api/v1' },
  keep.patch,
  false,
)
ok(stored?.api_key === 'old', 'merge keeps old key')

const cleared = mergeMoiZvonkiClubConfigForStore(club, { user_email: '', api_base: '' }, true)
ok(cleared === null, 'clear → null')

if (failed) {
  console.error(`\nfailed: ${failed}`)
  process.exit(1)
}
console.log('\nAll moi-zvonki club config checks passed')
