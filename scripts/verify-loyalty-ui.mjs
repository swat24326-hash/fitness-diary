/**
 * node scripts/verify-loyalty-ui.mjs
 * Фаза D: чип/вкладка, ПНК/lite/desk, пачки ≤80, last-good, glance не в pull/get-client.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { isPnkCardTabVisible } from '../src/lib/pnk/pnkStagesCore.js'
import {
  LOYALTY_GLANCE_FETCH_BATCH,
  LOYALTY_IDLE_NO_VISITS,
  chunkLoyaltyGlanceIds,
  formatLoyaltyAccountCopy,
  formatLoyaltyGlanceChip,
  isLoyaltyProgramClient,
  pickLoyaltyLastGood,
  shouldShowLoyaltyUi,
} from '../src/lib/loyalty/loyaltyGlanceUiCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const idle = {
  enabled: true,
  state: 'idle',
  points: 0,
  kcal_remainder: 0,
  weeks_credited: 0,
  cycle_start: null,
  unlock_on: null,
  can_redeem: false,
  missed_open_week: false,
  as_of: '2026-08-19',
}

const active = {
  ...idle,
  state: 'active',
  points: 50,
  weeks_credited: 1,
  cycle_start: '2026-08-17',
  unlock_on: '2026-11-17',
}

const pz = { id: 'c-pz', lifecycle: 'active', desk_hall: null }
const litePz = { id: 'c-lite', lifecycle: 'active', desk_hall: null, trainer_id: 't-notab' }
const openPnk = {
  id: 'c-pnk',
  lifecycle: 'pnk',
  pnk_stage: 'assigned',
  pnk_deliverables: { contact: 'x' },
  desk_hall: null,
}
const tz = { id: 'c-tz', lifecycle: 'active', desk_hall: 'tz' }
const az = { id: 'c-az', lifecycle: 'active', desk_hall: 'az' }

ok(shouldShowLoyaltyUi(pz) === true, '1 paid PZ — вкладка/чип можно')
ok(shouldShowLoyaltyUi(litePz) === true, '2 lite PZ — вкладка видна, не прячем')
ok(shouldShowLoyaltyUi(openPnk) === false, '3 открытый ПНК — нет поверхности баллов')
ok(shouldShowLoyaltyUi(tz) === false, '4 ТЗ — вне куша')
ok(shouldShowLoyaltyUi(az) === false, '5 АЗ — вне куша')
ok(shouldShowLoyaltyUi(null) === false, '5b нет клиента')
ok(isLoyaltyProgramClient(pz) === shouldShowLoyaltyUi(pz), '5c вкладка = программа')
ok(isLoyaltyProgramClient(tz) === false, '5d ТЗ не в программе — нет штампа сессии')
ok(isLoyaltyProgramClient(openPnk) === false, '5e открытый ПНК не в программе')

ok(!isPnkCardTabVisible(openPnk, 'loyalty'), '6 ПНК: вкладка Баллы скрыта как stats')
ok(!isPnkCardTabVisible(openPnk, 'stats'), '6b ПНК: stats тоже скрыта')
ok(isPnkCardTabVisible(pz, 'loyalty') === true, '6c не-ПНК: вкладка Баллы доступна фильтру')

{
  const copy = formatLoyaltyAccountCopy(idle)
  ok(copy.points === 0, '7 lite/idle: нули')
  ok(copy.hint === LOYALTY_IDLE_NO_VISITS, '7b текст «нет завершённых в дневнике»')
}

{
  const tab = formatLoyaltyAccountCopy(active)
  const chip = formatLoyaltyGlanceChip(active)
  ok(chip.show === true && chip.value === '50', '8 чип 50')
  ok(tab.points === 50, '8b вкладка 50 — тот же снимок')
  ok(chip.value === String(tab.points), '8c чип совпадает с вкладкой')
}

{
  const chipEmpty = formatLoyaltyGlanceChip(null)
  ok(chipEmpty.show === false, '9 нет снимка — чип не выдумывает 0')
}

{
  const last = pickLoyaltyLastGood(idle, null)
  ok(last && last.points === 0 && last.state === 'idle', '10 офлайн last-good из кэша')
  const liveWins = pickLoyaltyLastGood(idle, active)
  ok(liveWins && liveWins.points === 50, '10b живой GET важнее кэша')
  const missingLiveKeepsCache = pickLoyaltyLastGood(active, { foo: 1 })
  ok(missingLiveKeepsCache && missingLiveKeepsCache.points === 50, '10c мусор API не затирает кэш')
}

{
  const ids = Array.from({ length: 81 }, (_, i) => `id-${i}`)
  const chunks = chunkLoyaltyGlanceIds(ids)
  ok(LOYALTY_GLANCE_FETCH_BATCH === 80, '11 пачка клиента 80')
  ok(chunks.length === 2, '11b 81 id → 2 запроса')
  ok(chunks[0].length === 80 && chunks[1].length === 1, '11c 80+1')
  ok(chunkLoyaltyGlanceIds(ids).every((c) => c.length <= 80), '11d ни одна пачка >80')
}

{
  const pull = readFileSync(join(root, 'api/trainer-pull.js'), 'utf8')
  ok(!/loyalty/i.test(pull), '12 trainer-pull без loyalty payload')
  const getClient = readFileSync(join(root, 'api/get-client.js'), 'utf8')
  ok(!/loyalty/i.test(getClient), '12b get-client не расширен')
}

{
  const trainerPull = readFileSync(join(root, 'src/lib/syncHeaderPullTrainer.js'), 'utf8')
  ok(/refreshLoyaltyGlanceAfterTrainerPull/.test(trainerPull), '13 после trainer-pull — GET glance')
  const cardTabs = readFileSync(join(root, 'src/pages/trainer/ClientCardMainTabs.jsx'), 'utf8')
  ok(/id: 'loyalty'/.test(cardTabs), '13b вкладка Баллы в карточке')
  const lite = readFileSync(join(root, 'src/components/admin/AdminLitePzClientCardSection.jsx'), 'utf8')
  ok(/ClientLoyaltySection/.test(lite), '13c lite ПЗ показывает секцию баллов')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nloyalty ui verify ok')
