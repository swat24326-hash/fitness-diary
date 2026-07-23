import { buildMembershipDeleteConfirmCopy } from '../src/lib/membershipDeleteCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const empty = buildMembershipDeleteConfirmCopy({
  membership: { start_date: '2026-07-01', end_date: '2026-08-01', used_trainings: 0, total_trainings: 8 },
  linkedTrainingsCount: 0,
})
ok(empty.title.includes('Удалить'), 'title')
ok(empty.periodLabel.includes('01.07.2026'), 'period ru')
ok(!empty.hasLinkedTrainings, 'no linked')
ok(/ошибке|безопасн/i.test(empty.body), 'safe empty body')

const linked = buildMembershipDeleteConfirmCopy({
  membership: { start_date: '2026-07-01', end_date: '2026-08-01', used_trainings: 2, total_trainings: 8 },
  linkedTrainingsCount: 2,
})
ok(linked.hasLinkedTrainings, 'has linked')
ok(/дневнике|трениров/i.test(linked.body), 'warn about diary')
ok(linked.usedLabel === '2/8', 'used label')

const usedOnly = buildMembershipDeleteConfirmCopy({
  membership: { start_date: '2026-07-01', end_date: '2026-08-01', used_trainings: 1, total_trainings: 8 },
  linkedTrainingsCount: 0,
})
ok(usedOnly.hasLinkedTrainings, 'used counts as linked risk')
ok(/списан/i.test(usedOnly.body), 'warn about writeoffs')

console.log('verify-membership-delete: all passed')
