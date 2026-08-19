import {
  buildGeminiTrainerContour,
  collectClubTrainerDirectory,
  compactTrainerContourForPrompt,
} from '../src/lib/admin/geminiTrainerContour.js'
import { monthDateRange } from '../src/lib/admin/salesReportCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const membershipTypes = [
  { id: 't1', code: 'VIP', trainer_pay_per_session: 500 },
  { id: 't2', code: 'STD', trainer_pay_per_session: 300 },
]

const users = [
  { id: 'tr1', name: 'Алексей Иванов', role: 'trainer' },
  { id: 'tr2', name: 'Мария Петрова', role: 'тренер' },
]

const clients = [
  { id: 'c1', name: 'Клиент 1', trainer_id: 'tr1', archived_at: null },
  { id: 'c2', name: 'Клиент 2', trainer_id: 'tr1', archived_at: null },
  { id: 'c3', name: 'Клиент 3', trainer_id: 'tr2', archived_at: null },
]

const memberships = [
  {
    id: 'm1',
    client_id: 'c1',
    start_date: '2026-06-01',
    end_date: '2026-07-01',
    total_trainings: 10,
    used_trainings: 2,
    membership_type_id: 't1',
  },
  {
    id: 'm2',
    client_id: 'c2',
    start_date: '2026-05-01',
    end_date: '2026-05-31',
    total_trainings: 8,
    used_trainings: 8,
    membership_type_id: 't1',
  },
]

const trainings = [
  {
    id: 't1',
    trainer_id: 'tr1',
    client_id: 'c1',
    date: '2026-06-05',
    status: 'completed',
    data: { membership_id: 'm1' },
  },
  {
    id: 't2',
    trainer_id: 'tr1',
    client_id: 'c1',
    date: '2026-06-10',
    status: 'completed',
    data: { membership_id: 'm1' },
  },
  {
    id: 't3',
    trainer_id: 'tr1',
    client_id: 'c1',
    date: '2026-06-12',
    status: 'completed',
    data: {},
  },
  {
    id: 't4',
    trainer_id: 'tr2',
    client_id: 'c3',
    date: '2026-06-08',
    status: 'completed',
    data: { membership_id: 'm1' },
  },
]

const { start, end } = monthDateRange(2026, 6)
const trainers = collectClubTrainerDirectory(users, clients)
ok(trainers.length === 2, 'trainer directory')
ok(trainers.some((t) => t.trainer_id === 'tr1'), 'trainer tr1 in directory')

const contour = buildGeminiTrainerContour({
  trainers,
  clients,
  trainings,
  memberships,
  membershipTypes,
  dateFrom: start,
  dateTo: end,
  year: 2026,
  selectedTrainerId: 'tr1',
})

ok(contour.contour === 'trainer_tablets', 'contour id')
ok(contour.isolated_from === 'sales_manager_reports', 'isolated from sales')
ok(contour.selected_trainer_id === 'tr1', 'selected trainer id')
ok(contour.selected_trainer?.trainer_name === 'Алексей Иванов', 'selected trainer name')
ok(contour.selected_trainer?.completed_trainings === 3, 'completed trainings tr1')
ok(contour.selected_trainer?.no_type_trainings_ignored === 0, 'legacy без membership_id — тип по дате (не «Без типа»)')
ok(contour.selected_trainer?.personal_salary_month === 1500, 'personal salary tr1 (3×VIP)')
ok(contour.club_roll_up.trainers_count === 2, 'club roll up count')
ok(contour.club_roll_up.personal_salary_sum === 2000, 'club salary sum (tr1 1500 + tr2 500)')

const compact = compactTrainerContourForPrompt(contour, 'tr1')
ok(compact?.selected_trainer?.trainer_id === 'tr1', 'compact selected trainer')
ok(Array.isArray(compact?.trainers) && compact.trainers.length === 2, 'compact trainers list')
ok(compact?.trainers?.[0]?.yearly_trend_completed === undefined, 'compact drops yearly trend')

process.exit(failed > 0 ? 1 : 0)
