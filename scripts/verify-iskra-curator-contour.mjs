/**
 * node scripts/verify-iskra-curator-contour.mjs
 */
import {
  augmentPromptBlockForCurator,
  buildCuratorContextBlock,
  buildCuratorModeRule,
  buildCuratorRoleRule,
  buildNetworkClubsPlaceholder,
  isCuratorPersonalExtensionMode,
  isNetworkCuratorRole,
  resolveCuratorMode,
  resolveIskraAdvisorScope,
  shouldUseClubGeminiSnapshot,
} from '../src/lib/curator/iskraCuratorContourCore.js'
import {
  buildCuratorPersonaForContext,
  buildCuratorPersonaPromptRule,
  normalizeCuratorPersonaSettings,
} from '../src/lib/curator/iskraCuratorPersonaCore.js'
import {
  iskraAdvisorFullAccess,
  iskraAdvisorNetworkCurator,
  resolveIskraAdvisorRole,
} from '../src/lib/admin/iskraAdvisorRoles.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(resolveIskraAdvisorScope('app_admin') === 'club_admin', 'admin scope')
ok(resolveIskraAdvisorScope('curator') === 'network_curator', 'curator network scope')
ok(iskraAdvisorFullAccess('curator'), 'curator full business access')
ok(iskraAdvisorNetworkCurator('curator'), 'network curator flag')
ok(isNetworkCuratorRole('curator'), 'is network curator')

ok(resolveCuratorMode('как дела с планом продаж') === 'sales_kpi', 'default sales kpi intent')
ok(resolveCuratorMode('как выстроить привычку') === 'habits', 'habits intent')
ok(resolveCuratorMode('') === 'sales_kpi', 'empty → sales_kpi default')

ok(isCuratorPersonalExtensionMode('habits'), 'habits is personal extension')
ok(!isCuratorPersonalExtensionMode('sales_kpi'), 'sales_kpi not personal only')

const clubBlock = { sales_contour: { plan: 40 }, insights: { plan: {} } }
const augmented = augmentPromptBlockForCurator(clubBlock, {
  advisorRoleId: 'curator',
  mode: 'sales_kpi',
  curatorContext: { habits: [{ id: 'h1' }] },
})
ok(augmented.sales_contour?.plan === 40, 'curator keeps sales snapshot')
ok(augmented.advisor_scope === 'network_curator', 'curator scope tag')
ok(augmented.curator_context?.habits?.length === 1, 'curator context added')

ok(buildCuratorRoleRule().includes('продажи'), 'role rule business first')
ok(buildCuratorModeRule('habits').includes('дополнение'), 'habits mode additive')

ok(shouldUseClubGeminiSnapshot('curator'), 'curator uses club snapshot')

const network = buildNetworkClubsPlaceholder({ club_name: 'Север' })
ok(network?.clubs?.length === 1, 'network placeholder single club')

const curatorRole = resolveIskraAdvisorRole('curator')
ok(curatorRole.capabilities.includes('network_kpi'), 'network_kpi cap')
ok(curatorRole.capabilities.includes('curator_habits'), 'personal extension cap')
ok(curatorRole.analysisFocus === 'sales', 'analysis focus sales')

const persona = normalizeCuratorPersonaSettings({ tone: 'coach' })
ok(buildCuratorPersonaPromptRule(persona, 'sales_kpi').includes('KPI'), 'persona sales kpi')

const ctx = buildCuratorContextBlock(
  { persona: buildCuratorPersonaForContext(persona) },
  'companion',
)
ok(ctx.instruction.includes('дополняет'), 'context additive instruction')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-curator-contour: all checks passed')
