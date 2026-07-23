import {
  buildMembershipDeleteConfirmCopy,
  membershipDeleteBlockedByTrainings,
} from '../src/lib/membershipDeleteCore.js'

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
ok(empty.title.includes('Удалить'), 'title allow')
ok(!empty.blocked, 'empty not blocked')
ok(empty.confirmLabel === 'Удалить', 'confirm delete')
ok(/ошибке|безопасн/i.test(empty.body), 'safe empty body')

const linked = buildMembershipDeleteConfirmCopy({
  membership: { start_date: '2026-07-01', end_date: '2026-08-01', used_trainings: 2, total_trainings: 8 },
  linkedTrainingsCount: 2,
})
ok(linked.blocked, 'linked blocked')
ok(/Сначала удалите/i.test(linked.title), 'block title')
ok(/К тренировкам/i.test(linked.confirmLabel), 'go to trainings')
ok(/удалите/i.test(linked.body), 'instruct delete trainings first')

const usedOnly = buildMembershipDeleteConfirmCopy({
  membership: { start_date: '2026-07-01', end_date: '2026-08-01', used_trainings: 1, total_trainings: 8 },
  linkedTrainingsCount: 0,
})
ok(usedOnly.blocked, 'used_trainings blocks')
ok(membershipDeleteBlockedByTrainings({ membership: { used_trainings: 1 }, linkedTrainingsCount: 0 }), 'helper used')
ok(!membershipDeleteBlockedByTrainings({ membership: { used_trainings: 0 }, linkedTrainingsCount: 0 }), 'helper empty')

console.log('verify-membership-delete: all passed')
