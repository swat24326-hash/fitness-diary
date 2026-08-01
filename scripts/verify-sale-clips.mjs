/**
 * node scripts/verify-sale-clips.mjs
 */
import {
  matchClientByCardThenPhone,
  normalizeSalesPhoneDigits,
} from '../src/lib/admin/salesClientMatchCore.js'
import {
  validateSaleClipDraft,
  planSaleClipCreate,
  canMarkSaleClipDone,
  membershipFieldsFromSaleClip,
  buildSaleDayChecklist,
  parseEveningInboundText,
} from '../src/lib/admin/saleClipCore.js'
import {
  collectHoldingTrainerIds,
  filterHallOperationalClients,
  isClientOnHoldingTrainer,
} from '../src/lib/admin/holdingClientsCore.js'
import { isHoldingTrainerUser } from '../src/lib/admin/deskClosingImportCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeSalesPhoneDigits('8 (900) 111-22-33') === '79001112233', 'phone normalize 8→7')
ok(normalizeSalesPhoneDigits('+7 900 111 22 33') === '79001112233', 'phone normalize +7')

const clients = [
  { id: 'c1', card_number: '5426', phone: '89001112233', name: 'А', trainer_id: 't1' },
  { id: 'c2', card_number: '', phone: '79002223344', name: 'Б', trainer_id: 'hold' },
]

const byCard = matchClientByCardThenPhone({ clients, cardNumber: '5426', phone: '' })
ok(byCard.status === 'one' && byCard.matchedBy === 'card', 'match by card')
ok(byCard.reason && /карт/i.test(byCard.reason), 'card reason ru')

const byPhone = matchClientByCardThenPhone({ clients, cardNumber: '', phone: '79002223344' })
ok(byPhone.status === 'one' && byPhone.matchedBy === 'phone' && byPhone.weakMatch, 'weak phone match')

const fill = matchClientByCardThenPhone({ clients, cardNumber: '9999', phone: '79002223344' })
ok(fill.status === 'one' && fill.fillCard === '9999', 'fill card from clip')

const conflict = matchClientByCardThenPhone({
  clients: [
    { id: 'a', card_number: '1' },
    { id: 'b', card_number: '1' },
  ],
  cardNumber: '1',
})
ok(conflict.status === 'conflict' && /Два/i.test(conflict.reason), 'conflict reason')

ok(isHoldingTrainerUser({ name: 'Не назначен' }), 'holding by name')
ok(isHoldingTrainerUser({ is_system_placeholder: true, name: 'X' }), 'holding by flag')
const holdIds = collectHoldingTrainerIds([
  { id: 'hold', name: 'Не назначен' },
  { id: 't1', name: 'Семенов' },
])
ok(holdIds.has('hold') && !holdIds.has('t1'), 'collect holding ids')
ok(isClientOnHoldingTrainer(clients[1], holdIds), 'client on holding')
const hall = filterHallOperationalClients(clients, holdIds)
ok(hall.length === 1 && hall[0].id === 'c1', 'exclude holding from hall ops')

const withDesk = [
  ...clients,
  { id: 'desk1', card_number: '9', name: 'Desk', trainer_id: null, desk_hall: 'tz' },
]
const hallDesk = filterHallOperationalClients(withDesk, holdIds)
ok(hallDesk.length === 1 && hallDesk[0].id === 'c1', 'exclude desk null trainer from hall ops')
ok(
  filterHallOperationalClients([{ id: 'd', desk_hall: 'az', trainer_id: null }]).length === 0,
  'desk excluded without holding ids',
)

const bad = validateSaleClipDraft({ club_id: 'club', client_name: '', trainer_id: 't1', card_number: '1' })
ok(!bad.ok && /ФИО/i.test(bad.reason), 'draft requires name')

const plan = planSaleClipCreate({
  clients,
  membershipsByClientId: {
    c1: [{ start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 12, used_trainings: 0 }],
  },
  draft: {
    club_id: 'club',
    client_name: 'Тест',
    card_number: '5426',
    trainer_id: 't1',
    clip_date: '2026-08-01',
  },
  asOf: '2026-08-01',
})
ok(plan.ok && plan.clip.client_id === 'c1', 'plan binds client')
ok(plan.warnings.some((w) => /действует/i.test(w)), 'live membership warning')

const fields = membershipFieldsFromSaleClip({
  id: 'clip1',
  start_date: '2026-08-01',
  end_date: '2026-09-01',
  total_trainings: 8,
  membership_type_id: 'mt1',
})
ok(fields.clip_id === 'clip1' && fields.total_trainings === 8, 'membership fields from clip')

const doneOk = canMarkSaleClipDone({ status: 'awaiting' }, 'm1')
ok(doneOk.ok, 'can mark done')
const doneDup = canMarkSaleClipDone({ status: 'done', membership_id: 'm1' }, 'm1')
ok(doneDup.ok && doneDup.already, 'idempotent done')
const doneOther = canMarkSaleClipDone({ status: 'done', membership_id: 'm1' }, 'm2')
ok(!doneOther.ok && doneOther.reason, 'reject other membership')

const check = buildSaleDayChecklist({
  clips: [{ clip_date: '2026-08-01', status: 'awaiting', client_id: null }],
  asOf: '2026-08-01',
})
ok(!check.closedSoft && check.items.length >= 1 && check.items.every((i) => i.text), 'soft checklist reasons')

const parsed = parseEveningInboundText('Карта 5426\nИванов Иван\n89001112233')
ok(parsed.cardNumber === '5426' && parsed.phone, 'evening parse card+phone')
ok(parsed.reason && parsed.reason.length > 5, 'evening tip reason')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sale clip / match / holding checks passed')
