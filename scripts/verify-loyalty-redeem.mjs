/**
 * node scripts/verify-loyalty-redeem.mjs
 * Фаза E: кнопка списать, офлайн, роли, журнал, не очередь sync.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { LOYALTY_ERR } from '../src/lib/loyalty/loyaltyAccessCore.js'
import {
  canOpenLoyaltyJournal,
  filterLoyaltyJournalRows,
  formatLoyaltyJournalRow,
} from '../src/lib/loyalty/loyaltyJournalUiCore.js'
import {
  LOYALTY_OFFLINE_REDEEM,
  buildLoyaltyRedeemBody,
  canShowLoyaltyRedeemButton,
  clipLoyaltyRedeemComment,
  loyaltyRedeemButtonState,
  loyaltyRedeemConfirmText,
  loyaltyRedeemErrorText,
} from '../src/lib/loyalty/loyaltyRedeemUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const trainer = { isTrainer: true, isAdmin: false }
const sales = { isSalesManager: true, isAdmin: false }
const admin = { isAdmin: true }
const supervisor = { isSupervisor: true, isAdmin: false }

ok(canShowLoyaltyRedeemButton(trainer) === false, '1 тренер — нет кнопки')
ok(canShowLoyaltyRedeemButton(supervisor) === false, '2 управляющий — read-only')
ok(canShowLoyaltyRedeemButton(sales) === true, '3 менеджер — кнопка есть')
ok(canShowLoyaltyRedeemButton(admin) === true, '3b админ — кнопка есть')

ok(canOpenLoyaltyJournal(trainer) === false, '4 тренер — нет журнала')
ok(canOpenLoyaltyJournal(supervisor) === false, '4b управляющий — нет журнала')
ok(canOpenLoyaltyJournal(sales) === true, '4c менеджер — журнал')
ok(canOpenLoyaltyJournal(admin) === true, '4d админ — журнал')

const ready = {
  enabled: true,
  state: 'active',
  points: 150,
  can_redeem: true,
}

ok(
  loyaltyRedeemButtonState({ role: sales, online: false, snapshot: ready }).disabled === true,
  '5 офлайн — disabled',
)
ok(
  loyaltyRedeemButtonState({ role: sales, online: false, snapshot: ready }).reason === LOYALTY_OFFLINE_REDEEM,
  '5b текст «Списание только при сети.»',
)
ok(
  loyaltyRedeemButtonState({ role: trainer, online: true, snapshot: ready }).show === false,
  '5c тренер онлайн — кнопки нет',
)

const locked = { ...ready, can_redeem: false }
ok(
  loyaltyRedeemButtonState({ role: sales, online: true, snapshot: locked }).disabled === true,
  '6 !can_redeem — disabled',
)
ok(
  loyaltyRedeemButtonState({ role: sales, online: true, snapshot: locked }).reason === LOYALTY_ERR.cannotRedeem,
  '6b текст куша',
)

const go = loyaltyRedeemButtonState({ role: sales, online: true, snapshot: ready })
ok(go.show === true && go.disabled === false, '7 сеть + can_redeem — можно списать')

const body = buildLoyaltyRedeemBody({ clientId: 'c1', snapshot: ready, comment: '  подарок  ' })
ok(body.client_id === 'c1' && body.expected_points === 150, '8 expected_points = все баллы')
ok(body.comment === 'подарок', '8b комментарий trim')
ok(clipLoyaltyRedeemComment('x'.repeat(250)).length === 200, '8c комментарий ≤200')
ok(clipLoyaltyRedeemComment('') === '', '8d пустой комментарий можно')

ok(
  loyaltyRedeemConfirmText(150) === 'Списать 150 баллов? Списывается всё сразу.',
  '9 confirm all-or-nothing',
)
ok(loyaltyRedeemErrorText({ status: 409 }).includes('устарела'), '10 409 — цифра устарела')
ok(loyaltyRedeemErrorText({ error: LOYALTY_ERR.stalePoints }) === LOYALTY_ERR.stalePoints, '10b текст 409')

{
  const row = formatLoyaltyJournalRow({
    id: 'r1',
    client_id: 'c1',
    client_name: 'Иванов',
    at: '2026-08-19T10:00:00.000Z',
    points: 150,
    comment: 'шейкер',
  })
  ok(row.client_name === 'Иванов' && row.points === 150, '11 строка журнала')
  const filtered = filterLoyaltyJournalRows([row], 'шейк')
  ok(filtered.length === 1, '11b поиск по комментарию')
  ok(filterLoyaltyJournalRows([row], 'петров').length === 0, '11c чужой поиск пуст')
}

ok(!PUSH_ALLOWED_TABLES.has('loyalty_ledger'), '12 ledger не в sync allowlist')

{
  const service = readFileSync(join(root, 'src/lib/loyalty/loyaltyGlanceService.js'), 'utf8')
  ok(/postLoyaltyRedeem/.test(service), '12b redeem через API')
  ok(!/saveLocalWithSync/.test(service), '12c redeem не в очереди sync')
  const app = readFileSync(join(root, 'src/App.jsx'), 'utf8')
  ok(/\/sales\/loyalty/.test(app) && /path="loyalty"/.test(app), '13 маршруты admin/sales')
  ok(!/\/trainer\/loyalty/.test(app), '13b нет журнала у тренера')
  const controls = readFileSync(join(root, 'src/components/loyalty/LoyaltyRedeemControls.jsx'), 'utf8')
  ok(/loyaltyRedeemButtonState/.test(controls), '13c кнопка на вкладке из core')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nloyalty redeem verify ok')
