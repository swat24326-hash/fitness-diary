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
  GEMINI_INSTANT_CHIPS,
  GEMINI_QUICK_CHIPS,
} from '../src/lib/admin/geminiInstantReplies.js'
import {
  buildGeminiIntroReply,
  buildGeminiMicroIntro,
  matchGeminiIntroIntent,
  resolveGeminiClubLabel,
} from '../src/lib/admin/geminiAssistantIntro.js'
import { prepareTextForSpeech, pickGeminiSpeechVoice } from '../src/lib/geminiAnalyticsSpeech.js'
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
import {
  buildGeminiMonthCalendarContext,
  comparePlanToCalendar,
  formatCalendarContextLine,
  formatPlanPaceLine,
  formatTodayDateRu,
  shouldFlagLowPlan,
} from '../src/lib/admin/geminiMonthCalendarContext.js'
import {
  phrasePlanProgress,
  polishIskraReplyText,
  expandAbbreviationsForSpeech,
} from '../src/lib/admin/iskraReplyPhrasing.js'
import { buildIskraClubFinanceBlock } from '../src/lib/admin/clubFinanceForecastCore.js'
import { buildIskraIntroPitch } from '../src/lib/admin/iskraBusinessHighlights.js'

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
ok(snap.club_finance?.available === false || snap.club_finance?.fact, 'snapshot club finance block')
ok(snap.sales.pnk_total === 8, 'pnk total')
ok(snap.sales.plan_progress_pct === 66, 'plan progress')
ok(snap.sales.achieved_plan_level === 2, 'achieved plan level')
ok(snap.sales.profit_day_highlights?.best_day?.profit === 5100, 'best day profit')
ok(snap.sales.matrix_counts_pz_tz_az.pz === 3, 'matrix counts pz')
ok(snap.sales.trainings_by_card_type?.[0]?.code === 'VIP', 'trainings by card type')
ok(snap.insights?.plan?.pct === 66, 'insights plan pct')
ok(snap.insights?.direction_plan?.has_direction_plans === true, 'direction plan insights')
ok(snap.insights?.pnk?.total === 8, 'insights pnk')
ok(snap.finance?.net_profit === 3600, 'net profit with payroll')
ok(snap.operations.fit_city_completed_trainings === 15, 'fit city count')
ok(snap.trainings?.manager_report_total === 18, 'manager trainings total')
ok(snap.trainings?.gap_manager_minus_fit_city === 3, 'trainings gap')
ok(Array.isArray(snap.data_sources?.analysis_hints), 'data source hints')
ok(snap.sales.report_coverage_pct > 0, 'report coverage')
ok(snap.calendar_context?.month_relation, 'snapshot calendar context')
ok(snap.month_forecast?.available === false, 'month forecast on past month snapshot')
ok(snap.month_forecast?.reason === 'not_current_month', 'month forecast reason past month')
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
ok(buildSystemPrompt('male', 'X').includes('100 слов'), 'brief prompt rule')
ok(buildSystemPrompt('male', 'X').includes('club_finance'), 'prompt club finance rule')
ok(buildSystemPrompt('male', 'X').includes('ЯЗЫК ОТВЕТА'), 'prompt business language')
ok(buildSystemPrompt('male', 'Север').includes('sales_contour'), 'prompt internal sales contour')
ok(buildSystemPrompt('male', 'X').includes('советск'), 'prompt soviet tone')
ok(buildSystemPrompt('male', 'X').includes('ИСТОЧНИК ЦИФР'), 'prompt estimate policy rule')
ok(buildSystemPrompt('male', 'X').includes('Оценка ИСКРЫ'), 'prompt estimate disclaimer')
ok(buildSystemPrompt('male', 'X').includes('calendar_context'), 'prompt calendar rule')
ok(buildSystemPrompt('male', 'X').includes('club_finance'), 'prompt club finance in focus rule')

const midMonth = buildGeminiMonthCalendarContext(2026, 7, new Date(2026, 6, 15))
ok(midMonth.phase === 'middle', 'calendar middle july 15')
ok(midMonth.expected_plan_progress_pct === 48.4, 'calendar expected mid july')

const finalDays = buildGeminiMonthCalendarContext(2026, 7, new Date(2026, 6, 28))
ok(finalDays.phase === 'final_days', 'calendar final days')
ok(finalDays.days_remaining === 3, 'calendar days remaining')

const startMonth = buildGeminiMonthCalendarContext(2026, 7, new Date(2026, 6, 3))
ok(startMonth.phase === 'start', 'calendar start')
ok(comparePlanToCalendar(10, startMonth) === 'on_track', 'plan 10% ok at start')

const lateMonth = buildGeminiMonthCalendarContext(2026, 7, new Date(2026, 6, 25))
ok(comparePlanToCalendar(10, lateMonth) === 'behind', 'plan 10% behind late month')
ok(!shouldFlagLowPlan(10, 10000, startMonth), 'no low plan flag at start for 10%')
ok(shouldFlagLowPlan(10, 10000, lateMonth), 'low plan flag late month for 10%')

const calLine = formatCalendarContextLine(midMonth)
ok(!calLine.includes('undefined'), 'calendar line no undefined')
ok(calLine.includes('15 июля'), 'calendar line has date ru')
ok(calLine.includes('норма к дате'), 'calendar line speakable benchmark')
ok(formatTodayDateRu(midMonth) === '15 июля 2026', 'today date ru')

const badLine = formatCalendarContextLine(snap)
ok(badLine === '', 'calendar line rejects bare snapshot')

const dataBlock = buildGeminiPromptDataBlock(snap)
ok(dataBlock.calendar_context?.phase, 'prompt block calendar')
const compact = compactSnapshotForPrompt(snap)
ok(compact?.period?.label && !compact.operations, 'compact snapshot drops noise')
ok(compact?.sales_contour?.pnk_total === 8, 'compact pnk')
ok(compact?.sales_contour?.profit_nk === 6000, 'compact profit nk')
ok(compact?.sales_contour?.achieved_plan_level === 2, 'compact achieved level')
ok(compact?.sales_contour?.profit_day_highlights?.best_day?.date === '2026-06-15', 'compact best day')
ok(compact?.month_forecast?.reason === 'not_current_month', 'compact month forecast')
ok(dataBlock.month_forecast?.reason === 'not_current_month', 'prompt block month forecast')
ok(dataBlock.data_availability?.unavailable_topic_ids?.includes('month_forecast'), 'prompt block data availability')
ok(dataBlock.analysis_period && dataBlock.current_period && dataBlock.previous_period === undefined, 'prompt block no prev')
ok(isGeminiReplyIncomplete('ЭВС ИСКРА, июль 202', 'MAX_TOKENS'), 'truncated reply detected')
ok(!isGeminiReplyIncomplete('План на 45%, требуется усилить контроль по выручке.', 'STOP'), 'complete reply ok')
const gapHints = buildTrainingsGapHint(20, 5, 2, 30)
ok(gapHints.length > 0, 'gap hints')
ok(GEMINI_GENERATION_CONFIG.maxOutputTokens >= 512, 'enough output tokens')
ok(prepareTextForSpeech('**жирный**  текст').includes('жирный'), 'speech text clean')
ok(!prepareTextForSpeech('~тест / пункт • список').includes('~'), 'speech strips tilde')
ok(!prepareTextForSpeech('~тест / пункт • список').includes('/'), 'speech strips slash')
ok(prepareTextForSpeech('~тест / пункт • список').includes('тест'), 'speech keeps words')

ok(phrasePlanProgress(29.2) === 'план выполнен на 29,2%', 'phrase plan progress')
ok(polishIskraReplyText('план 29.2%').includes('план выполнен на 29.2%'), 'polish bare plan pct')

const paceLine = formatPlanPaceLine(midMonth, 29.2, 'on_track')
ok(paceLine.includes('норма к дате') && paceLine.includes('выполнено 29,2%') && paceLine.includes('в темпе'), 'pace line speakable')

const iskraSample =
  'ИСКРА: FIT-CITY Клинцы, июль 2026. Данные приняты: план 29.2% — 369 999 ₽ из 1 300 000 ₽. Сегодня 10 июля 2026, первая треть месяца; ориентир ~32.3% — факт 29.2%, в календарном темпе. Направления ПЗ/ТЗ/АЗ — без критичного отставания. Отчёты 9 из 31 (29%).'
const iskraSpeech = prepareTextForSpeech(iskraSample)
ok(!iskraSpeech.includes('~'), 'speech iskra sample no tilde')
ok(!iskraSpeech.includes('/'), 'speech iskra sample no slash')
ok(!iskraSpeech.includes('—'), 'speech iskra sample no em dash')
ok(!iskraSpeech.includes('₽'), 'speech iskra sample no ruble sign')
ok(!iskraSpeech.includes('%'), 'speech iskra sample no percent sign')
ok(iskraSpeech.includes('план выполнен на'), 'speech iskra plan phrasing')
ok(iskraSpeech.includes('норма к дате'), 'speech iskra benchmark phrasing')
ok(iskraSpeech.includes('рублей'), 'speech iskra sample rubles word')
ok(iskraSpeech.includes('процентов'), 'speech iskra sample percent word')
ok(iskraSpeech.includes('персональный зал'), 'speech expands pz direction')
ok(iskraSpeech.includes('тренажёрный зал'), 'speech expands tz direction')
ok(iskraSpeech.includes('аэробный зал'), 'speech expands az direction')
ok(!iskraSpeech.includes('ПЗ'), 'speech iskra sample no pz abbrev')
ok(!iskraSpeech.includes('ТЗ'), 'speech iskra sample no tz abbrev')
ok(!iskraSpeech.includes('АЗ'), 'speech iskra sample no az abbrev')

ok(expandAbbreviationsForSpeech('Отстающие: ПЗ на 12%, ТЗ на 8%.').includes('персональный зал на'), 'speech expand direction progress')
ok(expandAbbreviationsForSpeech('ПНК за месяц 8').includes('потенциальные новые клиенты'), 'speech expand pnk')
ok(expandAbbreviationsForSpeech('FIT-CITY Клинцы').includes('фит сити'), 'speech expand fit city brand')
ok(!prepareTextForSpeech('ИСКРА: FIT-CITY Клинцы').includes('FIT'), 'speech no latin fit city')

const voiceMicrosoftFemale = { name: 'Microsoft Svetlana Online (Natural)', lang: 'ru-RU' }
const voiceMicrosoftMale = { name: 'Microsoft Dmitry Online (Natural)', lang: 'ru-RU' }
const voiceMicrosoftNeural = {
  name: 'Microsoft Server Speech Text to Speech Voice (ru-RU, SvetlanaNeural)',
  lang: 'ru-RU',
}
const voiceMicrosoftIrina = { name: 'Microsoft Irina Desktop', lang: 'ru-RU' }
const voiceMicrosoftPavelDesktop = { name: 'Microsoft Pavel Desktop', lang: 'ru-RU' }
const voiceGoogleRu = { name: 'Google русский', lang: 'ru-RU' }
const voiceGoogleMale = { name: 'Google русский Male', lang: 'ru-RU' }
const voiceEn = { name: 'Microsoft Zira', lang: 'en-US' }

const edgeVoices = [voiceGoogleRu, voiceMicrosoftIrina, voiceMicrosoftFemale, voiceMicrosoftMale, voiceEn]
ok(pickGeminiSpeechVoice('female', edgeVoices)?.name.includes('Svetlana Online'), 'tts female prefers Svetlana Online')
ok(pickGeminiSpeechVoice('male', edgeVoices)?.name.includes('Dmitry Online'), 'tts male prefers Dmitry Online')
ok(pickGeminiSpeechVoice('female', [voiceGoogleRu, voiceMicrosoftNeural])?.name.includes('SvetlanaNeural'), 'tts female neural voice')
ok(!/google/i.test(pickGeminiSpeechVoice('female', edgeVoices)?.name ?? ''), 'tts skips Google when Microsoft available')
ok(pickGeminiSpeechVoice('male', [voiceGoogleRu, voiceMicrosoftPavelDesktop])?.name.includes('Pavel'), 'tts male prefers Pavel desktop over Google')
ok(pickGeminiSpeechVoice('male', [voiceGoogleMale, voiceGoogleRu])?.name.includes('Google'), 'tts google male only when no Microsoft male')
ok(pickGeminiSpeechVoice('female', [voiceGoogleRu, voiceEn])?.name.includes('Google'), 'tts google fallback when no Microsoft')
ok(pickGeminiSpeechVoice('female', []) === null, 'tts empty voices')

const voiceMicrosoftPavel = { name: 'Microsoft Pavel Online (Natural)', lang: 'ru-RU' }
ok(pickGeminiSpeechVoice('male', [voiceMicrosoftFemale, voiceMicrosoftPavel])?.name.includes('Pavel'), 'tts male prefers Pavel when no Dmitry')

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

ok(GEMINI_QUICK_CHIPS.length === 7, 'quick chips include month forecast')
ok(GEMINI_INSTANT_CHIPS.length >= GEMINI_QUICK_CHIPS.length, 'instant chips cover quick chips')

ok(matchGeminiInstantChip(GEMINI_INSTANT_CHIPS.find((c) => c.id === 'month_forecast').message) === 'month_forecast', 'instant chip month forecast')

ok(matchGeminiInstantChip(GEMINI_INSTANT_CHIPS.find((c) => c.id === 'pnk').message) === 'pnk', 'instant chip pnk')
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
ok(instantPayroll?.includes('финансовом отчёте') && instantPayroll?.includes('личных зарплат'), 'instant payroll gap business')

ok(matchGeminiInstantChip(GEMINI_INSTANT_CHIPS.find((c) => c.id === 'plan').message) === 'plan', 'instant chip plan')
ok(matchGeminiInstantChip('случайный текст') === null, 'instant chip miss')
const instantPlan = buildGeminiInstantReply('plan', { snapshot: snap, gender: 'male' })
ok(instantPlan?.includes('выполнен на') && instantPlan?.includes('66%') && instantPlan.includes('уровня 2') && instantPlan.endsWith('.'), 'instant plan reply')
ok(!instantPlan?.includes('undefined'), 'instant plan no undefined')

const instantForecast = buildGeminiInstantReply('month_forecast', {
  snapshot: {
    ...snap,
    month_forecast: {
      available: true,
      forecast_gross_total: 1200000,
      plan_level_3: 1300000,
      forecast_plan_pct: 92.3,
      shortfall_rub: 100000,
      surplus_rub: 0,
      forecast_net_profit: 450000,
      report_days: 10,
      days_in_month: 30,
    },
    club_finance: {
      available: true,
      forecast: {
        gross_rub: 1200000,
        plan_pct: 92.3,
        shortfall_rub: 100000,
        surplus_rub: 0,
        net_profit_rub: 450000,
        directions: [{ label: 'ПЗ', plan_target_rub: 400000, forecast_progress_pct: 85 }],
      },
      fact: { plan_target_rub: 1300000 },
    },
  },
})
ok(instantForecast?.includes('Прогноз вала на конец месяца'), 'instant forecast gross')
ok(instantForecast?.includes('не дотянем') && instantForecast?.includes('92.3%'), 'instant forecast shortfall')
ok(instantForecast?.includes('Чистая прибыль к концу месяца'), 'instant forecast net profit')
ok(instantForecast?.includes('отстают: ПЗ'), 'instant forecast direction lag')
ok(instantForecast?.endsWith('.'), 'instant forecast ends with dot')

const cfBlock = buildIskraClubFinanceBlock({
  monthRows: [
    { report_date: '2026-07-01', profit_nk: 1000 },
    { report_date: '2026-07-05', profit_nk: 1000 },
    { report_date: '2026-07-10', profit_nk: 1000 },
  ],
  year: 2026,
  month: 7,
  planForm: { plan_level_3: 1300000, plan_pz: 400000, plan_tz: 300000, plan_az: 300000 },
  today: new Date(2026, 6, 10),
})
ok(cfBlock?.available === true && cfBlock.forecast?.directions?.length === 3, 'club finance block directions')
ok(
  (instantPlan?.match(/отстаём|отстающие|без критичного|в темпе/gi) ?? []).length <= 2,
  'instant plan no redundant lag wording',
)
ok(
  instantPlan?.includes('направлен') ||
    instantPlan?.includes('ПЗ') ||
    instantPlan?.includes('без критичного') ||
    !instantPlan?.includes('Отстающие'),
  'instant plan direction hint',
)

const julySnap = buildGeminiSnapshot({
  clubName: 'FIT-CITY Клинцы',
  year: 2026,
  month: 7,
  monthRows: rows,
  plan: { plan_total: 1300000, plan_level_1: 300000, plan_level_2: 800000, plan_level_3: 1300000 },
  fitCityCompleted: 10,
  membershipTypes,
  includeFinance: false,
})
const instantPlanJuly = buildGeminiInstantReply('plan', {
  snapshot: julySnap,
  gender: 'female',
})
ok(instantPlanJuly?.includes('июля') && !instantPlanJuly?.includes('undefined'), 'instant plan july calendar')
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
ok(introClub.includes('план') || introClub.includes('прогноз'), 'intro business pitch')
ok(buildIskraIntroPitch(snap).includes('план'), 'intro pitch helper')
const introOther = buildGeminiIntroReply('standard', {
  snapshot: snap,
  gender: 'female',
  clubName: 'FIT-CITY Юг',
})
ok(introOther.includes('FIT-CITY Юг') && (introOther.includes('план') || introOther.includes('прогноз')), 'intro other club business')
const microNoClub = buildGeminiMicroIntro({ hasClub: false, gender: 'male' })
ok(microNoClub.includes('филиал') || microNoClub.includes('шапке'), 'micro no club hint')

process.exit(failed > 0 ? 1 : 0)
