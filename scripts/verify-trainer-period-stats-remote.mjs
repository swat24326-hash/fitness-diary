/**
 * Границы периода + защита от регрессии «membership_id does not exist».
 * node scripts/verify-trainer-period-stats-remote.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { previousEqualPeriod } from '../src/lib/admin/coachQualityBriefCore.js'
import {
  mergeLocalAndRemoteTrainings,
  mergeRowsById,
} from '../src/lib/trainer/trainerRemoteMerge.js'
import { computeTrainerSelfPayroll } from '../src/lib/trainer/trainerSelfPayroll.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

{
  const prev = previousEqualPeriod('2026-07-01', '2026-07-31')
  ok(!!prev, 'prev period exists')
  const fetchFrom = prev.dateFrom
  ok(fetchFrom < '2026-07-01', 'облако тянем раньше начала выбранного периода')
  ok(prev.dateTo === '2026-06-30', 'prev ends day before July')
}

{
  const prev = previousEqualPeriod('2026-07-28', '2026-07-28')
  ok(prev?.dateFrom === '2026-07-27' && prev?.dateTo === '2026-07-27', 'один день')
}

{
  const local = [
    { id: 'a', date: '2026-05-01' },
    { id: 'b', date: '2026-07-10' },
    { id: 'c', date: '2026-08-01' },
  ]
  const remote = [{ id: 'b', date: '2026-07-10', status: 'completed' }]
  const merged = mergeLocalAndRemoteTrainings(local, remote, '2026-06-01', '2026-07-31')
  ok(merged.length === 3, 'merge length 3')
  ok(merged.some((t) => t.id === 'a'), 'keep before range')
  ok(merged.some((t) => t.id === 'c'), 'keep after range')
  ok(merged.find((t) => t.id === 'b')?.status === 'completed', 'remote wins in range')
}

{
  const merged = mergeRowsById(
    [
      { id: 'm1', membership_type_id: 'old' },
      { id: 'm2', membership_type_id: 'keep' },
    ],
    [{ id: 'm1', membership_type_id: 'new' }],
  )
  ok(merged.find((m) => m.id === 'm1')?.membership_type_id === 'new', 'remote membership wins')
  ok(merged.some((m) => m.id === 'm2'), 'local-only membership kept')
}

{
  // Регрессия: select с membership_id/updated_at → PostgREST error → ложный локальный кэш
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const periodSrc = readFileSync(join(root, 'src/lib/trainer/trainerPeriodStatsService.js'), 'utf8')
  const payrollSrc = readFileSync(join(root, 'src/lib/trainer/trainerSelfPayrollService.js'), 'utf8')
  const panelSrc = readFileSync(join(root, 'src/components/TrainerPayrollPanel.jsx'), 'utf8')

  ok(
    periodSrc.includes("TRAINER_TRAININGS_REMOTE_SELECT") &&
      periodSrc.includes("'id, trainer_id, client_id, club_id, date, status, data'"),
    'remote select = существующие колонки trainings',
  )
  ok(!/\.select\([^)]*membership_id/.test(periodSrc), 'нет select membership_id в period stats')
  ok(!/\.select\([^)]*updated_at/.test(periodSrc), 'нет select updated_at в period stats')
  ok(payrollSrc.includes('fetchTrainerTrainingsRemoteInRange'), 'ЗП тянет remote trainings')
  ok(payrollSrc.includes('fetchTrainerMembershipsRemote'), 'ЗП тянет remote memberships')
  ok(panelSrc.includes('loadTrainerSelfPayrollAmounts'), 'панель ЗП через cloud service')

  const selfPay = computeTrainerSelfPayroll({
    trainerId: 'tr1',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
    membershipTypes: [{ id: 't1', trainer_pay_per_session: 700 }],
    memberships: [{ id: 'm1', membership_type_id: 't1' }],
    trainings: [
      {
        id: 'x1',
        trainer_id: 'tr1',
        status: 'completed',
        date: '2026-07-10',
        data: { membership_id: 'm1' },
      },
      {
        id: 'x2',
        trainer_id: 'tr1',
        status: 'completed',
        date: '2026-07-11',
        data: { membership_id: 'm1' },
      },
    ],
  })
  ok(selfPay === 1400, 'ЗП = 2 × 700 по типу карты из data.membership_id')
}

console.log('verify-trainer-period-stats-remote: all passed')
