/**
 * Оферта Ядра: реквизиты ИП, принятие управляющим, маршруты.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  OFFER_MUST_COVER,
  OFFER_PARTY,
  OFFER_PATH,
  OFFER_VERSION,
  hasAcceptedCurrentOffer,
  offerGateLeadRu,
  offerSections,
  staffNeedsOfferAccept,
} from '../src/lib/legal/offerCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

console.log('реквизиты')
ok(OFFER_PARTY.name.includes('Семенов'), 'ФИО')
ok(OFFER_PARTY.inn === '325502073860', 'ИНН')
ok(OFFER_PARTY.ogrnip === '316325600050493', 'ОГРНИП')
ok(OFFER_PARTY.address === 'г. Брянск', 'адрес — город')
ok(OFFER_PARTY.email === '2806199@bk.ru', 'email')
ok(OFFER_PATH === '/offer' && OFFER_VERSION === '2026-10-18', 'путь и версия')

console.log('разделы')
const blob = offerSections()
  .map((s) => `${s.title} ${s.body}`)
  .join('\n')
for (const needle of OFFER_MUST_COVER) {
  ok(blob.includes(needle), `в тексте есть «${needle}»`)
}

console.log('принятие')
ok(!staffNeedsOfferAccept('admin', null), 'админ — без оферты')
ok(!staffNeedsOfferAccept('trainer', null), 'тренер — без оферты')
ok(staffNeedsOfferAccept('supervisor', null), 'управляющий без метки — нужна оферта')
ok(staffNeedsOfferAccept('supervisor', { offer_accepted_at: '2026-10-01T00:00:00Z', offer_version: 'old' }), 'старая версия — снова')
ok(
  !staffNeedsOfferAccept('supervisor', {
    offer_accepted_at: '2026-10-16T12:00:00Z',
    offer_version: OFFER_VERSION,
  }),
  'текущая версия — ок',
)
ok(hasAcceptedCurrentOffer({ offer_accepted_at: '2026-10-16T12:00:00Z', offer_version: OFFER_VERSION }), 'hasAccepted')
ok(/Доступ к клубу на месте/.test(offerGateLeadRu()), 'короткий лид gate')
ok(new RegExp(OFFER_VERSION).test(offerGateLeadRu()), 'версия в лиде gate')

console.log('wiring')
ok(/path="\/offer"/.test(src('src/App.jsx')) && /OfferPage/.test(src('src/App.jsx')), 'маршрут /offer')
ok(/SupervisorOfferGate/.test(src('src/App.jsx')), 'gate в LoggedInLayout')
ok(/profilePending/.test(src('src/components/legal/SupervisorOfferGate.jsx')), 'gate ждёт профиль — без мигания')
ok(/offer-accept/.test(src('api/me-profile.js')), 'API offer-accept')
ok(/offer_accepted_at/.test(src('api/_lib/adminSupabase.js')), 'профиль тянет offer_*')
ok(/isMissingOfferColumnError|CALLER_PROFILE_FIELDS_BASE/.test(src('api/_lib/adminSupabase.js')), 'API fallback без колонок offer_*')
ok(/offer_accepted/.test(src('src/context/AuthContext.jsx')), 'Auth fallback без колонок offer_*')
const mig = src('supabase/migrations/20261104120000_users_offer_accepted.sql')
ok(/offer_accepted_at/.test(mig) && /offer_version/.test(mig) && /ADD COLUMN IF NOT EXISTS/.test(mig), 'миграция добавляет offer_* идемпотентно')
ok(/offer-accept\.css/.test(src('src/index.css')), 'стили')
ok(OFFER_PARTY.registeredOn === '2016-01-12', 'дата регистрации из свидетельства ИП')
ok(/grandfather-offer-supervisors/.test(src('docs/PD_152FZ.md')), 'docs: опция grandfather для старых клубов')
ok(/уже работающие клубы|уже работающ/i.test(src('docs/PD_152FZ.md')), 'docs: сценарий действующих клубов')

if (failed) {
  console.error(`\nverify-offer: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-offer: ok')
