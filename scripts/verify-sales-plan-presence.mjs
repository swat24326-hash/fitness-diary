import {
  salesPlanFormHasTarget,
  salesPlanRowHasTarget,
} from '../src/lib/admin/salesPlanPresenceCore.js'
import { resolvePlanDraftAfterLoad } from '../src/lib/admin/adminSalesDraftStorage.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(!salesPlanRowHasTarget(null), 'null plan has no target')
ok(!salesPlanRowHasTarget({}), 'empty plan has no target')
ok(salesPlanRowHasTarget({ plan_level_3: 1200000 }), 'level3 counts')
ok(salesPlanRowHasTarget({ plan_total: 500000 }), 'plan_total counts')
ok(salesPlanFormHasTarget({ plan_level_1: '1000000' }), 'form level1 counts')

const serverForm = {
  plan_level_1: '1000000',
  plan_level_2: '1100000',
  plan_level_3: '1200000',
}
const emptyForm = {
  plan_level_1: '',
  plan_level_2: '',
  plan_level_3: '',
}
const serverFp = JSON.stringify(serverForm)
const emptyFp = JSON.stringify(emptyForm)
const blocked = resolvePlanDraftAfterLoad({
  draft: {
    v: 1,
    serverBaselineFp: serverFp,
    fingerprint: emptyFp,
    planForm: emptyForm,
  },
  serverFp,
  planForm: serverForm,
})
ok(!blocked.restored && blocked.discardStaleEmpty, 'refuse empty draft over server levels')
ok(blocked.planForm.plan_level_3 === '1200000', 'keeps server levels')

process.exit(failed > 0 ? 1 : 0)
