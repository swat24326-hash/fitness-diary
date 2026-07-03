import {
  buildGeminiSnapshot,
  periodLabelRu,
  previousMonthParts,
  sumMatrixTotalsFromDailyRows,
  trimChatHistory,
} from '../src/lib/admin/geminiAnalyticsSnapshot.js'
import { buildPersona, buildSystemPrompt, formatGeminiUserError, GEMINI_ANALYTICS_MODEL, isGeminiRetryableError } from '../src/lib/admin/geminiAnalyticsPrompt.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const rows = [
  { profit_nk: 1000, profit_dk: 500, profit_uk: 0, trainings_count: 10, pz_nk: 2, pz_dk: 1 },
  { profit_nk: 2000, profit_dk: 0, profit_uk: 100, trainings_count: 8, tz_nk: 3 },
]

const snap = buildGeminiSnapshot({
  clubName: 'FIT-CITY Север',
  year: 2026,
  month: 6,
  monthRows: rows,
  plan: { plan_total: 10000, plan_pz: 50 },
  expenseAmount: 1000,
  payrollClubTotal: 2000,
  fitCityCompleted: 15,
  inactiveInPeriod: 3,
  trainingCompleted: 40,
  includeFinance: true,
})

ok(snap.sales.profit_total === 3600, 'profit total')
ok(snap.sales.plan_progress_pct === 36, 'plan progress')
ok(snap.finance?.net_profit === 600, 'net profit with payroll')
ok(snap.operations.fit_city_completed_trainings === 15, 'fit city count')
ok(periodLabelRu(2026, 6).includes('июнь'), 'period label')

const matrix = sumMatrixTotalsFromDailyRows(rows)
ok(matrix.pz === 3 && matrix.tz === 3, 'matrix totals')

ok(previousMonthParts(2026, 1)?.month === 12, 'prev month jan')
ok(previousMonthParts(2026, 6)?.month === 5, 'prev month jun')

ok(trimChatHistory([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]).length === 2, 'trim history')

const prompt = buildSystemPrompt('male', 'Север')
ok(prompt.includes('Василий') && prompt.includes('Север'), 'system prompt male')
ok(buildPersona('female').name === 'Василиса', 'persona female')

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
ok(isGeminiRetryableError('models/gemini-1.5-flash is not found'), 'retry on missing model')
ok(isGeminiRetryableError('This model is currently experiencing high demand'), 'retry on overload')
ok(formatGeminiUserError('This model is currently experiencing high demand').includes('перегружен'), 'overload error ru')
ok(formatGeminiUserError('You exceeded your current quota').includes('Лимит'), 'quota error ru')
ok(formatGeminiUserError('x'.repeat(300)).length <= 220, 'long error trimmed')

process.exit(failed > 0 ? 1 : 0)
