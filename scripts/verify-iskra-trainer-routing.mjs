/**
 * node scripts/verify-iskra-trainer-routing.mjs
 */
import { matchGeminiIntroIntent, buildGeminiIntroReply } from '../src/lib/admin/geminiAssistantIntro.js'
import {
  isTrainerFocusedQuestion,
  resolveTrainerIdFromMessage,
  stripIskraAddressPrefix,
} from '../src/lib/admin/iskraTrainerRouting.js'
import { buildGeminiInstantReply } from '../src/lib/admin/geminiInstantReplies.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const trainers = [
  { trainer_id: 't1', trainer_name: 'Роман Петров' },
  { trainer_id: 't2', trainer_name: 'Иван Сидоров' },
]

ok(stripIskraAddressPrefix('Искра, сводка по тренеру Роман') === 'сводка по тренеру Роман', 'strip address')
ok(isTrainerFocusedQuestion('Искра, сводка по тренеру Роман за этот месяц'), 'trainer question detected')
ok(matchGeminiIntroIntent('Искра, сводка по тренеру Роман за этот месяц') === null, 'not intro on trainer ask')
ok(resolveTrainerIdFromMessage('сводка по тренеру Роман за месяц', trainers) === 't1', 'resolve Roman')

const intro = buildGeminiIntroReply('standard', {
  clubName: 'FIT-CITY Клинцы',
  year: 2026,
  month: 7,
  snapshot: {
    club_name: 'FIT-CITY Клинцы',
    period: { label: 'июль 2026', year: 2026, month: 7, days_in_month: 31 },
    sales: {
      plan_total: 1_300_000,
      plan_progress_pct: 33.4,
      plan_fact_gross: 434_359,
      days_with_reports: 5,
    },
    club_finance: { available: true, forecast: { plan_pct: 103.6, will_reach_plan: true } },
  },
})

ok(intro.includes('ЭВС «ИСКРА» на связи'), 'single iskra branding')
ok(!/ИСКРА на связи\. ЭВС «ИСКРА»/.test(intro), 'no double iskra opener')
const nowCount = (intro.match(/Сейчас:/g) || []).length
ok(nowCount <= 1, 'plan line not duplicated')

const snap = {
  club_name: 'FIT-CITY',
  period: { label: 'июль 2026', year: 2026, month: 7 },
  trainer_contour: {
    selected_trainer_id: 't1',
    selected_trainer: {
      trainer_id: 't1',
      trainer_name: 'Роман Петров',
      completed_trainings: 42,
      personal_salary_month: 12000,
      active_clients_total: 18,
      current_active_holders: 15,
      inactive_clients_holders: 3,
      no_type_trainings_ignored: 0,
    },
    trainers,
  },
}

const summary = buildGeminiInstantReply('trainer_summary', { snapshot: snap, gender: 'female' })
ok(summary?.includes('Роман Петров'), 'trainer summary name')
ok(summary?.includes('42'), 'trainer summary trainings')

if (failed) process.exit(1)
console.log('verify-iskra-trainer-routing: all passed')
