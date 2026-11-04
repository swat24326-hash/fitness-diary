/**
 * Создание ПНК: attach только после confirm; ФИО без overwrite не трогаем.
 * node scripts/verify-pnk-create-attach.mjs
 */
import {
  buildPnkAttachClientRow,
  buildPnkAttachMatchPreview,
  canWritePnkCreateAttach,
  resolvePnkCreateAttachTarget,
} from '../src/lib/pnk/pnkCreateAttachCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

const desk = {
  id: 'c-desk',
  name: 'Сидоров Алексей',
  phone: '79001112233',
  card_number: '3303',
  trainer_id: 'tr-old',
  lifecycle: null,
}

ok(resolvePnkCreateAttachTarget({ clients: [], phone: '', cardNumber: '' }).action === 'create', 'без карты/телефона — create')
ok(
  resolvePnkCreateAttachTarget({ clients: [desk], phone: '', cardNumber: '3303' }).action === 'attach',
  'по карте — attach target',
)
ok(!canWritePnkCreateAttach({}), 'без confirm — не писать')
ok(!canWritePnkCreateAttach({ confirmAttach: false }), 'confirm false — не писать')
ok(canWritePnkCreateAttach({ confirmAttach: true }), 'confirm true — писать')

const mems = [
  {
    id: 'm1',
    membership_type_id: 't1',
    start_date: '2026-01-01',
    end_date: '2026-11-22',
    total_trainings: 8,
    used_trainings: 4,
  },
]
const preview = buildPnkAttachMatchPreview({
  client: desk,
  memberships: mems,
  todayIso: '2026-11-04',
  proposedName: 'Пуман Никита Павлович',
})
ok(preview?.name === 'Сидоров Алексей', 'preview: имя найденного')
ok(preview?.card_number === '3303', 'preview: карта')
ok(preview?.nameDiffers === true, 'preview: ФИО отличается')
ok(/до 22\.11\.2026/.test(preview?.membershipFact || ''), 'preview: до даты')
ok(/4\/8/.test(preview?.membershipFact || ''), 'preview: 4/8')

const keepName = buildPnkAttachClientRow(desk, {
  name: 'Пуман Никита Павлович',
  phone: '79009998877',
  cardNumber: '3303',
  trainerId: 'tr-new',
  pnk_trial_sessions: 1,
})
ok(keepName.name === 'Сидоров Алексей', 'attach без overwrite — ФИО не меняем')
ok(keepName.trainer_id === 'tr-new', 'attach: тренер новый')
ok(String(keepName.lifecycle ?? '') === 'pnk' || Boolean(keepName.pnk_created_at), 'attach: lifecycle pnk')

const renamed = buildPnkAttachClientRow(desk, {
  name: 'Пуман Никита Павлович',
  phone: '79009998877',
  cardNumber: '3303',
  trainerId: 'tr-new',
  overwriteName: true,
})
ok(renamed.name === 'Пуман Никита Павлович', 'attach с overwrite — ФИО новое')

const conflict = resolvePnkCreateAttachTarget({
  clients: [
    { ...desk, id: 'a' },
    { id: 'b', name: 'Другой', phone: '79001112233', card_number: '9999' },
  ],
  phone: '79001112233',
  cardNumber: '',
})
ok(conflict.action === 'conflict' || conflict.action === 'attach', 'телефон: conflict или one (preferOperational)')

if (failed) {
  console.error(`\nverify-pnk-create-attach: ${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-create-attach: all passed')
