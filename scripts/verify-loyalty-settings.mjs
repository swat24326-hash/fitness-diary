/**
 * node scripts/verify-loyalty-settings.mjs
 * Фаза G: тумблер клуба, интервалы, вкладка Структура, не выдумываем «вкл».
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { STRUCTURE_TAB_LABELS } from '../src/lib/breadcrumbsCore.js'
import { applyProgramToggle, isDateEnabled } from '../src/lib/loyalty/loyaltyEnabledCore.js'
import { normalizeLoyaltySettings } from '../src/lib/loyalty/loyaltySettingsCore.js'
import { applyLoyaltySettingsPost } from '../src/lib/loyalty/loyaltySettingsWriteCore.js'
import {
  assertLoyaltySettingsGet,
  assertLoyaltySettingsPost,
} from '../src/lib/loyalty/loyaltyAccessCore.js'
import {
  formatLoyaltyIntervals,
  interpretLoyaltySettingsHttp,
  LOYALTY_DISABLE_CONFIRM,
  LOYALTY_ENABLE_CONFIRM,
  loyaltyDraftToPostBody,
  loyaltySettingsPostOmitsIntervals,
  loyaltySettingsSaveState,
  loyaltySettingsToDraft,
  loyaltyToggleConfirmText,
  LOYALTY_SETTINGS_TAB_ID,
  LOYALTY_SETTINGS_TAB_LABEL,
} from '../src/lib/loyalty/loyaltySettingsUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const offRow = { enabled: false }
const onRow = {
  enabled: true,
  enabled_at: '2026-01-01',
  enabled_intervals: [{ start: '2026-01-01', end: null }],
  points_per_week: 50,
}

ok(normalizeLoyaltySettings({}).enabled === false, '1 дефолт выкл')
ok((normalizeLoyaltySettings({}).enabled_intervals ?? []).length === 0, '1b пустые интервалы')
ok(isDateEnabled('2026-08-19', []) === false, '1c без интервала день не капает')

{
  const firstOn = applyLoyaltySettingsPost(offRow, { enabled: true }, '2026-08-19')
  ok(firstOn.settings.enabled === true && firstOn.settings.enabled_at === '2026-08-19', '2 первое вкл → enabled_at')
  ok(
    firstOn.settings.enabled_intervals.some((iv) => iv.start === '2026-08-19' && iv.end == null),
    '2b открытый интервал с сегодня',
  )
}

{
  const off = applyLoyaltySettingsPost(onRow, { enabled: false }, '2026-08-19')
  ok(off.settings.enabled === false && off.settings.enabled_intervals[0].end === '2026-08-19', '3 выкл end=as_of')
  ok(isDateEnabled('2026-08-19', off.settings.enabled_intervals) === true, '3b день выключения ещё капает')
  ok(isDateEnabled('2026-08-20', off.settings.enabled_intervals) === false, '3c следующий день не капает')
}

{
  const off = applyProgramToggle([{ start: '2026-01-01', end: null }], { enabled: false, as_of: '2026-08-19' })
  const on = applyProgramToggle(off, { enabled: true, as_of: '2026-08-19' })
  ok(on.length === 1 && on[0].end == null && on[0].start === '2026-01-01', '4 выкл+вкл в тот же день — без дырки')
}

{
  const rates = applyLoyaltySettingsPost(onRow, { points_per_week: 80 }, '2026-08-19')
  ok(rates.toggled === false && rates.settings.points_per_week === 80, '5 ставки без тумблера')
  ok(rates.settings.enabled_intervals[0].end == null, '5b интервал не закрыли')
}

ok(assertLoyaltySettingsPost({ isAdmin: true }, 'club-a').ok === true, '6 admin POST ок')
ok(assertLoyaltySettingsPost({ isTrainer: true, profile: { club_id: 'club-a' } }, 'club-a').status === 403, '6b trainer POST 403')
ok(assertLoyaltySettingsPost({ isSalesManager: true, salesClubId: 'club-a' }, 'club-a').status === 403, '6c sales POST 403')
ok(assertLoyaltySettingsGet({ isTrainer: true, profile: { club_id: 'club-a' } }, 'club-a').ok === true, '6d trainer GET своего клуба')

ok(!PUSH_ALLOWED_TABLES.has('club_loyalty_settings'), '7 settings не в sync очереди')
ok(!PUSH_ALLOWED_TABLES.has('loyalty_ledger'), '7b ledger не в sync')

{
  const body = loyaltyDraftToPostBody(loyaltySettingsToDraft(onRow), 'club-a')
  ok(loyaltySettingsPostOmitsIntervals(body), '8 POST без enabled_intervals')
  ok(body.club_id === 'club-a' && body.enabled === true, '8b club_id и enabled в теле')
}

ok(LOYALTY_DISABLE_CONFIRM.includes('сегодня'), '9 выкл: сегодня ещё капает')
ok(LOYALTY_ENABLE_CONFIRM.includes('сегодня'), '9b вкл: с сегодня')
ok(loyaltyToggleConfirmText(true, false) === LOYALTY_DISABLE_CONFIRM, '9c confirm выкл')
ok(loyaltyToggleConfirmText(false, true) === LOYALTY_ENABLE_CONFIRM, '9d confirm вкл')
ok(loyaltyToggleConfirmText(true, true) === '', '9e ставки без confirm')

{
  const parsed = interpretLoyaltySettingsHttp(503, { migration_needed: true })
  ok(parsed.migration_needed === true && parsed.settings.enabled === false, '10 нет таблиц — не выдумываем вкл')
}
ok(interpretLoyaltySettingsHttp(200, { ok: true, settings: onRow }).settings.enabled === true, '10b живой GET')
ok(interpretLoyaltySettingsHttp(403, { error: 'Нет доступа' }).ok === false, '10c 403')

ok(loyaltySettingsSaveState({ clubId: '', isAdmin: true, online: true }).canSave === false, '11 без клуба')
ok(loyaltySettingsSaveState({ clubId: 'c1', isAdmin: false, online: true }).canSave === false, '11b не админ')
ok(loyaltySettingsSaveState({ clubId: 'c1', isAdmin: true, online: false }).canSave === false, '11c офлайн')
ok(loyaltySettingsSaveState({ clubId: 'c1', isAdmin: true, online: true, migrationNeeded: true }).canSave === false, '11d миграция')
ok(loyaltySettingsSaveState({ clubId: 'c1', isAdmin: true, online: true }).canSave === true, '11e admin онлайн')

ok(normalizeLoyaltySettings({ cycle_months: 99 }).cycle_months === 24, '12 months потолок 24')
ok(normalizeLoyaltySettings({ kcal_chunk: 0 }).kcal_chunk === 1, '12b chunk 0 → 1')

ok(formatLoyaltyIntervals([]).includes('не капают'), '13 пустые интервалы — честный текст')
ok(formatLoyaltyIntervals([{ start: '2026-01-01', end: null }]).includes('открыт'), '13b открытый интервал')

ok(LOYALTY_SETTINGS_TAB_ID === 'loyalty', '14 tab id')
ok(STRUCTURE_TAB_LABELS.loyalty === LOYALTY_SETTINGS_TAB_LABEL, '14b крошка = вкладка')

{
  const structure = readFileSync(join(root, 'src/pages/admin/AdminStructure.jsx'), 'utf8')
  ok(/tab === 'loyalty'/.test(structure) && /AdminLoyaltySettings/.test(structure), '15 Структура рендерит вкладку')
  const client = readFileSync(join(root, 'src/lib/loyalty/loyaltyApiClient.js'), 'utf8')
  ok(/action=loyalty-settings/.test(client) && /postLoyaltySettings/.test(client), '15b GET/POST settings в API-клиенте')
  const section = readFileSync(join(root, 'src/components/loyalty/LoyaltySettingsSection.jsx'), 'utf8')
  ok(!/enabled_intervals/.test(section), '15c UI не шлёт интервалы руками')
  const hook = readFileSync(join(root, 'src/hooks/useLoyaltySettings.js'), 'utf8')
  ok(/postLoyaltySettings/.test(hook) && !/saveLocalWithSync/.test(hook), '15d не через sync_queue')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nloyalty settings verify ok')
