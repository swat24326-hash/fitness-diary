/**
 * node scripts/verify-iskra-advisor.mjs
 */
import { buildGeminiSnapshot } from '../src/lib/admin/geminiAnalyticsSnapshot.js'
import {
  buildIskraAdviceCards,
  buildIskraAdviceReply,
  buildIskraAdviceSummary,
  matchIskraAdviceIntent,
} from '../src/lib/admin/iskraBusinessAdvice.js'
import { matchIskraAppGuideIntent, buildIskraAppGuideReply } from '../src/lib/admin/iskraAppGuide.js'
import { mapAppRoleToAdvisorRole, filterSnapshotForAdvisorRole } from '../src/lib/admin/iskraAdvisorScope.js'
import { buildIskraProactiveHints, pickRotatingHint } from '../src/lib/admin/iskraProactiveHints.js'
import {
  buildIskraAdvisorContext,
  buildAdvisorPromptAppend,
} from '../src/lib/admin/iskraAdvisorPipeline.js'
import {
  resolveIskraAdvisorRole,
  isIskraAdvisorRoleActive,
  iskraAdvisorFullAccess,
  ISKRA_ACTIVE_ADVISOR_ROLE_IDS,
} from '../src/lib/admin/iskraAdvisorRoles.js'
import { buildGeminiInstantReply, GEMINI_INSTANT_CHIPS } from '../src/lib/admin/geminiInstantReplies.js'
import { buildGeminiPromptDataBlock, buildSystemPrompt } from '../src/lib/admin/geminiAnalyticsPrompt.js'
import { resolvePanelQuickChips } from '../src/lib/admin/iskraQuickChipsCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const rows = [
  {
    report_date: '2026-06-01',
    profit_nk: 1000,
    profit_dk: 5000,
    profit_uk: 0,
    trainings_count: 10,
    pnk_total: 2,
    pz_nk: 1,
    pz_dk: 0,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 4 }],
  },
  {
    report_date: '2026-06-15',
    profit_nk: 500,
    profit_dk: 2000,
    profit_uk: 100,
    trainings_count: 8,
    pnk_total: 1,
    tz_nk: 1,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 2 }],
  },
]

const membershipTypes = [{ id: 't1', code: 'VIP' }]

const snap = buildGeminiSnapshot({
  clubName: 'FIT-CITY Север',
  year: 2026,
  month: 6,
  monthRows: rows,
  plan: { plan_total: 10000, plan_level_1: 3000, plan_level_2: 6000, plan_level_3: 10000, plan_pz: 4000 },
  expenseAmount: 1000,
  payrollClubTotal: 2000,
  fitCityCompleted: 15,
  inactiveInPeriod: 3,
  trainingCompleted: 40,
  membershipTypes,
  includeFinance: true,
})

ok(mapAppRoleToAdvisorRole('admin') === 'app_admin', 'admin → app_admin')
ok(isIskraAdvisorRoleActive('app_admin'), 'app_admin active')
ok(!isIskraAdvisorRoleActive('club_supervisor'), 'supervisor not active yet')
ok(!isIskraAdvisorRoleActive('curator'), 'curator not active yet')
ok(ISKRA_ACTIVE_ADVISOR_ROLE_IDS.length === 1, 'only one active role')

const adminCtx = buildIskraAdvisorContext({ appRole: 'admin', snapshot: snap })
ok(adminCtx.advisorRoleId === 'app_admin', 'admin advisor context')
ok(adminCtx.snapshot?.finance != null, 'admin full finance snapshot')
ok(iskraAdvisorFullAccess('app_admin'), 'admin full access flag')
ok(iskraAdvisorFullAccess('curator'), 'curator full business access')

const curatorRole = resolveIskraAdvisorRole('curator')
ok(curatorRole.capabilities.includes('network_kpi'), 'curator network kpi')
ok(curatorRole.capabilities.includes('curator_habits'), 'curator personal extension')

const supervisorRole = resolveIskraAdvisorRole('club_supervisor')
ok(!supervisorRole.active, 'supervisor role def inactive')
const filteredSupervisor = filterSnapshotForAdvisorRole(snap, 'club_supervisor')
ok(!filteredSupervisor.insights?.finance, 'supervisor scope hides finance when enabled later')

const adminCards = buildIskraAdviceCards(snap, { advisorRoleId: 'app_admin' })
ok(adminCards.length >= 1, 'advice cards for admin')
const supervisorCards = buildIskraAdviceCards(snap, { advisorRoleId: 'club_supervisor' })
ok(!supervisorCards.some((c) => c.id === 'payroll_pressure'), 'supervisor no payroll advice when scoped')

const summary = buildIskraAdviceSummary(snap, { advisorRoleId: 'app_admin', limit: 2 })
ok(summary.has_actionable && summary.cards.length <= 2, 'advice summary compact')

ok(matchIskraAdviceIntent('Что делать с планом?') === 'advice', 'advice intent')
ok(matchIskraAppGuideIntent('Как создать клиента?') === 'client', 'app guide client intent')

const adviceReply = buildGeminiInstantReply('advice', {
  snapshot: snap,
  gender: 'male',
  advisorRoleId: 'app_admin',
})
ok(adviceReply?.includes('ИСКРА') && adviceReply?.includes('На связи'), 'advice reply')
ok(adviceReply !== buildGeminiInstantReply('plan', { snapshot: snap, gender: 'male' }), 'advice ≠ plan')

const appReply = buildGeminiInstantReply('app_guide', {
  snapshot: snap,
  advisorRoleId: 'app_admin',
})
ok(appReply?.includes('Клиенты'), 'app guide instant chip')

const adminGuide = buildIskraAppGuideReply('general', { advisorRoleId: 'app_admin' })
ok(adminGuide.includes('Полный доступ'), 'admin app guide hint')

const promptAppend = buildAdvisorPromptAppend(adminCtx)
ok(promptAppend.includes('Админ') && promptAppend.includes('Полный доступ'), 'admin prompt append')

const dataBlock = buildGeminiPromptDataBlock(snap, null, {
  advisorRoleId: 'app_admin',
  advisorAdvice: summary,
})
ok(dataBlock.advisor_advice?.cards?.length >= 1, 'prompt advisor_advice')
ok(buildSystemPrompt('male', 'Север', { advisorRole: resolveIskraAdvisorRole('app_admin') }).includes('Админ'), 'system prompt admin')

const panelChips = resolvePanelQuickChips({ appRole: 'admin' })
ok(panelChips.some((c) => (c.handler_id ?? c.id) === 'plan'), 'admin panel plan chip')
ok(panelChips.some((c) => (c.handler_id ?? c.id) === 'advice'), 'admin panel advice chip')
ok(panelChips.length >= 8, 'admin full quick chips')

ok(GEMINI_INSTANT_CHIPS.some((c) => c.id === 'app_guide'), 'app_guide chip registered')

const planAdvice = buildIskraAdviceReply(snap, { focus: 'plan', club: 'X', period: 'июнь', advisorRoleId: 'app_admin' })
ok(planAdvice.includes('ИСКРА'), 'plan-focused advice')

const hints = buildIskraProactiveHints({ plan_progress_pct: 33, report_days: 0 }, { clubName: 'X' })
ok(hints.some((h) => h.id === 'plan_behind'), 'proactive plan hint')
ok(hints.some((h) => h.id === 'no_reports'), 'proactive no reports hint')
ok(pickRotatingHint(hints, 1)?.id, 'rotating hint')

if (failed) process.exit(1)
console.log('verify-iskra-advisor: all passed')
