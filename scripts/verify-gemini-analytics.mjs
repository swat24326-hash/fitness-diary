import {
  buildGeminiSnapshot,
  buildProfitDayHighlights,
  compactSnapshotForPrompt,
  periodLabelRu,
  previousMonthParts,
  sumMatrixTotalsFromDailyRows,
  topTrainingsByCardType,
  trimChatHistory,
} from '../src/lib/admin/geminiAnalyticsSnapshot.js'
import {
  buildGeminiPromptDataBlock,
  buildPersona,
  buildSystemPrompt,
  formatGeminiUserError,
  GEMINI_ANALYTICS_MODEL,
  GEMINI_GENERATION_CONFIG,
  isGeminiReplyIncomplete,
  isGeminiRetryableError,
  resolveGeminiComparePrevious,
  shouldComparePreviousMonth,
} from '../src/lib/admin/geminiAnalyticsPrompt.js'
import { buildTrainingsGapHint } from '../src/lib/admin/geminiAnalyticsDomain.js'
import {
  buildGeminiInstantReply,
  matchGeminiInstantChip,
  GEMINI_QUICK_CHIPS,
} from '../src/lib/admin/geminiInstantReplies.js'
import {
  buildGeminiIntroReply,
  buildGeminiMicroIntro,
  matchGeminiIntroIntent,
  resolveGeminiClubLabel,
} from '../src/lib/admin/geminiAssistantIntro.js'
import { prepareTextForSpeech } from '../src/lib/geminiAnalyticsSpeech.js'
import {
  clearGeminiSnapshotCacheForTests,
  getCachedGeminiSnapshot,
  setCachedGeminiSnapshot,
} from '../api/_lib/geminiAnalyticsCache.js'
import {
  clearGeminiResponseCacheForTests,
  getCachedGeminiResponse,
  setCachedGeminiResponse,
} from '../api/_lib/geminiAnalyticsResponseCache.js'
import { buildGeminiPanelKpi, reportDateForMonth } from '../src/lib/admin/geminiPanelKpi.js'
import { applyMonthComparisonInsights } from '../src/lib/admin/clubMonthAnalyticsCore.js'

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
    profit_dk: 500,
    profit_uk: 0,
    trainings_count: 10,
    pnk_total: 5,
    pz_nk: 2,
    pz_dk: 1,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 4 }],
  },
  {
    report_date: '2026-06-15',
    profit_nk: 5000,
    profit_dk: 0,
    profit_uk: 100,
    trainings_count: 8,
    pnk_total: 3,
    tz_nk: 3,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 2 }],
  },
]

const membershipTypes = [
  { id: 't1', code: 'VIP' },
  { id: 't2', code: 'STAND' },
]

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

ok(snap.sales.profit_total === 6600, 'profit total')
ok(snap.sales.pnk_total === 8, 'pnk total')
ok(snap.sales.plan_progress_pct === 66, 'plan progress')
ok(snap.sales.achieved_plan_level === 2, 'achieved plan level')
ok(snap.sales.profit_day_highlights?.best_day?.profit === 5100, 'best day profit')
ok(snap.sales.matrix_counts_pz_tz_az.pz === 3, 'matrix counts pz')
ok(snap.sales.trainings_by_card_type?.[0]?.code === 'VIP', 'trainings by card type')
ok(snap.insights?.plan?.pct === 66, 'insights plan pct')
ok(snap.insights?.pnk?.total === 8, 'insights pnk')
ok(snap.finance?.net_profit === 3600, 'net profit with payroll')
ok(snap.operations.fit_city_completed_trainings === 15, 'fit city count')
ok(snap.trainings?.manager_report_total === 18, 'manager trainings total')
ok(snap.trainings?.gap_manager_minus_fit_city === 3, 'trainings gap')
ok(Array.isArray(snap.data_sources?.analysis_hints), 'data source hints')
ok(snap.sales.report_coverage_pct > 0, 'report coverage')
ok(periodLabelRu(2026, 6).includes('июнь'), 'period label')

const matrix = sumMatrixTotalsFromDailyRows(rows)
ok(matrix.pz === 3 && matrix.tz === 3, 'matrix totals')

ok(previousMonthParts(2026, 1)?.month === 12, 'prev month jan')
ok(previousMonthParts(2026, 6)?.month === 5, 'prev month jun')

ok(trimChatHistory([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]).length === 2, 'trim history')

const prompt = buildSystemPrompt('male', 'Север')
ok(prompt.includes('ИСКРА') && prompt.includes('Север'), 'system prompt iskra')
ok(buildPersona('female').name === 'ИСКРА', 'persona iskra')

const noFinance = buildGeminiSnapshot({
  clubName: 'X',
  year: 2026,
  month: 1,
  monthRows: [],
  plan: null,
  includeFinance: false,
})
ok(noFinance.finance === undefined, 'finance hidden')

ok(GEMINI_ANALYTICS_MODEL === 'gemini-2.5-flash-lite', 'default model lite')
ok(buildSystemPrompt('male', 'X').includes('90 слов'), 'brief prompt rule')
ok(buildSystemPrompt('male', 'X').includes('sales_contour'), 'prompt sales contour')
ok(buildSystemPrompt('male', 'Север').includes('trainer_contour'), 'prompt trainer contour')
ok(buildSystemPrompt('male', 'X').includes('НИЧЕГО НЕ СЧИТАЕШЬ'), 'prompt no calc rule')
const compact = compactSnapshotForPrompt(snap)
ok(compact?.period?.label && !compact.operations, 'compact snapshot drops noise')
ok(compact?.sales_contour?.pnk_total === 8, 'compact pnk')
ok(compact?.sales_contour?.profit_nk === 6000, 'compact profit nk')
ok(compact?.sales_contour?.achieved_plan_level === 2, 'compact achieved level')
ok(compact?.sales_contour?.profit_day_highlights?.best_day?.date === '2026-06-15', 'compact best day')
const dataBlock = buildGeminiPromptDataBlock(snap, null)
ok(dataBlock.analysis_period && dataBlock.current_period && dataBlock.previous_period === undefined, 'prompt block no prev')
ok(isGeminiReplyIncomplete('ЭВС ИСКРА, июль 202', 'MAX_TOKENS'), 'truncated reply detected')
ok(!isGeminiReplyIncomplete('План на 45%, требуется усилить контроль по выручке.', 'STOP'), 'complete reply ok')
const gapHints = buildTrainingsGapHint(20, 5, 2, 30)
ok(gapHints.length > 0, 'gap hints')
ok(GEMINI_GENERATION_CONFIG.maxOutputTokens >= 512, 'enough output tokens')
ok(prepareTextForSpeech('**жирный**  текст').includes('жирный'), 'speech text clean')
ok(isGeminiRetryableError('models/gemini-1.5-flash is not found'), 'retry on missing model')
ok(isGeminiRetryableError('This model is currently experiencing high demand'), 'retry on overload')
ok(formatGeminiUserError('This model is currently experiencing high demand').includes('перегружен'), 'overload error ru')
ok(formatGeminiUserError('You exceeded your current quota').includes('Лимит'), 'quota error ru')
ok(formatGeminiUserError('x'.repeat(300)).length <= 220, 'long error trimmed')

ok(shouldComparePreviousMonth('Сравни с прошлым месяцем'), 'compare phrase')
ok(!shouldComparePreviousMonth('Как выполнен план продаж'), 'no compare phrase')
ok(resolveGeminiComparePrevious({ userMessage: 'динамика за месяц', comparePrevious: false }), 'resolve compare text')
ok(resolveGeminiComparePrevious({ userMessage: 'x', comparePrevious: true }), 'resolve compare flag')

clearGeminiSnapshotCacheForTests()
setCachedGeminiSnapshot('c1', 2026, 6, { ok: true })
ok(getCachedGeminiSnapshot('c1', 2026, 6)?.ok === true, 'snapshot cache hit')
ok(getCachedGeminiSnapshot('c1', 2026, 7) === null, 'snapshot cache miss')
clearGeminiSnapshotCacheForTests()

ok(/^\d{4}-\d{2}-\d{2}$/.test(reportDateForMonth(2026, 1) ?? ''), 'report date iso')
const kpi = buildGeminiPanelKpi(
  {
    monthSummary: { profitTotal: 50000, dayCount: 10 },
    plan: { plan_total: 100000 },
    fitCityTypeStats: { totalCounted: 38 },
  },
  2026,
  6,
)
ok(kpi?.planPct === 50, 'kpi plan pct')
ok(kpi?.reportsLabel === '10/30', 'kpi reports label')
ok(kpi?.pzTrainings === 0, 'kpi pz trainings fallback')

const snapLevelOnly = buildGeminiSnapshot({
  clubName: 'X',
  year: 2026,
  month: 6,
  monthRows: rows,
  plan: { plan_level_3: 10000 },
})
ok(snapLevelOnly.sales.plan_total === 10000, 'resolve plan from level 3')

const highlights = buildProfitDayHighlights(rows, 2026, 6)
ok(highlights?.best_day?.date === '2026-06-15', 'profit highlights helper')

const byType = topTrainingsByCardType(rows, membershipTypes, 3)
ok(byType[0]?.count === 6, 'top trainings by card type')

ok(matchGeminiInstantChip(GEMINI_QUICK_CHIPS.find((c) => c.id === 'pnk').message) === 'pnk', 'instant chip pnk')
const instantPnk = buildGeminiInstantReply('pnk', { snapshot: snap, gender: 'male' })
ok(instantPnk?.includes('8') && instantPnk.endsWith('.'), 'instant pnk reply')
const instantBest = buildGeminiInstantReply('bestday', { snapshot: snap, gender: 'male' })
ok(instantBest?.includes('лучший день') && instantBest?.includes('15.6'), 'instant best day reply')

const instantPayroll = buildGeminiInstantReply('payroll_gap', {
  snapshot: {
    ...snap,
    trainer_contour: {
      club_roll_up: { personal_salary_sum: 1800 },
    },
  },
})
ok(instantPayroll?.includes('finance.trainer_payroll') && instantPayroll?.includes('personal_salary'), 'instant payroll gap')

ok(matchGeminiInstantChip(GEMINI_QUICK_CHIPS.find((c) => c.id === 'plan').message) === 'plan', 'instant chip plan')
ok(matchGeminiInstantChip('случайный текст') === null, 'instant chip miss')
const instantPlan = buildGeminiInstantReply('plan', { snapshot: snap, gender: 'male' })
ok(instantPlan?.includes('66%') && instantPlan.includes('уровня 2') && instantPlan.endsWith('.'), 'instant plan reply')
const prevSnap = {
  ...snap,
  period: { label: 'май 2026' },
  sales: { ...snap.sales, profit_total: 2000, plan_progress_pct: 20 },
}
applyMonthComparisonInsights(snap, prevSnap)
const instantCompare = buildGeminiInstantReply('compare', {
  snapshot: snap,
  previousSnapshot: prevSnap,
})
ok(instantCompare?.includes('май'), 'instant compare reply')

clearGeminiResponseCacheForTests()
setCachedGeminiResponse('c1', 2026, 6, 'male', false, 'test q', 'cached answer')
ok(getCachedGeminiResponse('c1', 2026, 6, 'male', false, 'test q') === 'cached answer', 'response cache hit')
ok(getCachedGeminiResponse('c1', 2026, 6, 'male', false, 'other') === null, 'response cache miss')
clearGeminiResponseCacheForTests()

ok(matchGeminiIntroIntent('Кто ты?') === 'standard', 'intro intent who')
ok(matchGeminiIntroIntent('откуда цифры') === 'sources', 'intro intent sources')
ok(matchGeminiIntroIntent('ты бот?') === 'identity', 'intro intent identity')
ok(resolveGeminiClubLabel('') === 'филиал', 'club label fallback')
const introClub = buildGeminiIntroReply('standard', {
  snapshot: snap,
  gender: 'male',
  clubName: 'FIT-CITY Север',
})
ok(introClub.includes('FIT-CITY Север') && introClub.includes('ИСКРА'), 'intro uses club name and iskra')
const introOther = buildGeminiIntroReply('standard', {
  snapshot: snap,
  gender: 'female',
  clubName: 'FIT-CITY Юг',
})
ok(introOther.includes('FIT-CITY Юг') && introOther.includes('trainer_contour'), 'intro other club contours')
const microNoClub = buildGeminiMicroIntro({ hasClub: false, gender: 'male' })
ok(microNoClub.includes('филиал') || microNoClub.includes('шапке'), 'micro no club hint')

process.exit(failed > 0 ? 1 : 0)
