/**
 * node scripts/verify-iskra-knowledge-base.mjs
 */
import { buildGeminiPromptDataBlock } from '../src/lib/admin/geminiAnalyticsPrompt.js'
import {
  ISKRA_APP_KB_CHIP_IDS,
  shouldRouteChipToGemini,
} from '../src/lib/admin/iskraChipRoutingCore.js'
import { ISKRA_KB_ARTICLES } from '../src/lib/admin/iskraKnowledgeBaseArticles.js'
import {
  buildKbInstantReply,
  buildKbPromptBlock,
  searchKbArticles,
} from '../src/lib/admin/iskraKnowledgeBaseCore.js'
import { buildIskraAppGuideReply } from '../src/lib/admin/iskraAppGuide.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(ISKRA_KB_ARTICLES.length >= 11, 'article count')
ok(ISKRA_KB_ARTICLES.some((a) => a.id === 'client_create'), 'client_create article')
ok(ISKRA_KB_ARTICLES.some((a) => a.id === 'pnk_funnel'), 'pnk_funnel article')

const clientHits = searchKbArticles('как создать клиента', { topic: 'client' })
ok(clientHits[0]?.id === 'client_create', 'search client_create')

const pnkHits = searchKbArticles('как провести пнк', { topic: 'sales' })
ok(pnkHits.some((a) => a.id === 'pnk_funnel'), 'search pnk_funnel')

const syncHits = searchKbArticles('не синхронизируется планшет', { topic: 'sync' })
ok(syncHits.length >= 1, 'search sync topic')

const instant = buildKbInstantReply('добавить клиента', 'client')
ok(instant.includes('Клиенты'), 'instant reply has steps')
ok(instant.includes('1.'), 'instant reply numbered')

const promptBlock = buildKbPromptBlock('как оформить абонемент', 'membership')
ok(promptBlock?.articles?.length >= 1, 'prompt block articles')
ok(promptBlock?.source === 'fit_city_kb', 'prompt block source')

const dataBlock = buildGeminiPromptDataBlock(
  { club_name: 'Север', period: { year: 2026, month: 7, label: 'июль 2026' } },
  null,
  { userMessage: 'как создать клиента в приложении', panelSegment: 'sales' },
)
ok(dataBlock.app_knowledge?.articles?.length >= 1, 'gemini data block app_knowledge')

ok(ISKRA_APP_KB_CHIP_IDS.has('app_guide'), 'app_guide in KB chips')
ok(shouldRouteChipToGemini('app_guide', 'app_admin'), 'admin app_guide → gemini')
ok(!shouldRouteChipToGemini('app_guide', 'club_supervisor'), 'supervisor app_guide → instant')

const guideKb = buildIskraAppGuideReply('client', {
  userMessage: 'создать клиента',
  club: 'Север',
  period: 'июль',
})
ok(guideKb.includes('Клиенты') || guideKb.includes('клиент'), 'app guide uses KB')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-knowledge-base: all checks passed')
