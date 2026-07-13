/**
 * node scripts/verify-iskra-response-mode.mjs
 */
import { buildGeminiSnapshot } from '../src/lib/admin/geminiAnalyticsSnapshot.js'
import { buildGeminiPromptDataBlock, buildSystemPrompt } from '../src/lib/admin/geminiAnalyticsPrompt.js'
import { augmentPromptDataBlockForAdmin } from '../src/lib/admin/iskraAdminPromptContext.js'
import {
  buildIskraResponseFormatRule,
  extractIskraSpeechSnippet,
  isDeepAnalysisQuestion,
  normalizeIskraResponseMode,
  resolveAdviceCardLimit,
  resolveChatHistoryTurns,
  resolveGeminiGenerationConfig,
  resolveIskraResponseMode,
  shouldSkipGeminiEdge,
} from '../src/lib/admin/iskraResponseModeCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeIskraResponseMode('подробно') === 'deep', 'normalize подробно')
ok(normalizeIskraResponseMode('deep') === 'deep', 'normalize deep')
ok(resolveIskraResponseMode({ advisorRoleId: 'app_admin', userPreference: 'deep' }) === 'deep', 'admin deep pref')
ok(resolveIskraResponseMode({ advisorRoleId: 'club_supervisor' }) === 'brief', 'supervisor brief')
ok(resolveIskraResponseMode({ chipId: 'plan', chipUsesInstant: true }) === 'brief', 'instant chip brief')
ok(
  resolveIskraResponseMode({ advisorRoleId: 'app_admin', chipId: 'plan', chipUsesInstant: false }) === 'standard',
  'admin gemini chip not forced brief',
)
ok(isDeepAnalysisQuestion('Разбери месяц и дай план действий'), 'deep question detect')
ok(resolveIskraResponseMode({ advisorRoleId: 'app_admin', userMessage: 'Почему просел план?' }) === 'deep', 'auto deep')

const briefCfg = resolveGeminiGenerationConfig('brief')
const deepCfg = resolveGeminiGenerationConfig('deep')
ok(briefCfg.maxOutputTokens === 384, 'brief tokens')
ok(resolveGeminiGenerationConfig('standard').maxOutputTokens === 1024, 'standard tokens')
ok(deepCfg.maxOutputTokens === 1536, 'deep tokens')
ok(shouldSkipGeminiEdge('deep'), 'skip edge deep')
ok(!shouldSkipGeminiEdge('brief'), 'edge ok brief')

ok(resolveAdviceCardLimit('deep') === 8, 'deep advice limit')
ok(resolveChatHistoryTurns('deep') === 12, 'deep history turns')

ok(buildIskraResponseFormatRule('deep').includes('развёрнутый'), 'deep format rule')
ok(buildIskraResponseFormatRule('brief').includes('50 слов'), 'brief format rule')
ok(!buildSystemPrompt('male', 'Север', { responseMode: 'deep' }).includes('50 слов'), 'deep system no 50 words')
ok(buildSystemPrompt('male', 'Север', { responseMode: 'brief' }).includes('50 слов'), 'brief system 50 words')

const snippet = extractIskraSpeechSnippet('Первый абзац с фактом.\n\nВторой с деталями и шагами.', 'deep')
ok(snippet.includes('Первый') && !snippet.includes('Второй'), 'speech snippet first para')

const snap = buildGeminiSnapshot({
  clubName: 'Север',
  year: 2026,
  month: 6,
  monthRows: [],
  plan: null,
  includeFinance: false,
})

const block = buildGeminiPromptDataBlock(snap, null, {
  advisorRoleId: 'app_admin',
  responseMode: 'deep',
})
ok(block.response_mode === 'deep', 'prompt block mode')
ok(block.trainers_summary !== undefined || !snap.trainer_contour, 'trainers summary when contour')

const augmented = augmentPromptDataBlockForAdmin({ analysis_period: 'июнь' }, snap, { responseMode: 'standard' })
ok(augmented.trainers_summary !== undefined || !snap.trainer_contour, 'augment standard')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-response-mode: all checks passed')
