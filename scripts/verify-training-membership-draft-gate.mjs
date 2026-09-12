/**
 * node scripts/verify-training-membership-draft-gate.mjs
 * Gate абона: копирование / существующий draft = та же ранняя активация, что у новой.
 * INC-2026-09-12-01
 */
import {
  resolveTrainerDraftMembershipOpenGate,
  shouldOfferEarlyActivateAfterDebitFail,
} from '../src/lib/trainer/trainingMembershipDraftGateCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const earlyProposal = { membershipId: 'm-new', to: { start: '2026-09-12', end: '2026-10-12' } }
const lateProposal = { membershipId: 'm-late', to: { start: '2026-09-12', end: '2026-10-12' } }

/* INC-2026-09-12-01: копирование → существующий draft, старый закрыт, новый upcoming. */
const copyDraft = resolveTrainerDraftMembershipOpenGate({
  isAdmin: false,
  status: 'draft',
  isNewTraining: false,
  hasMembershipSummary: false,
  earlyOfferOk: true,
  earlyProposal,
})
ok(copyDraft.loadState === 'awaiting_activate', 'копирование: пустая плитка + upcoming → awaiting_activate')
ok(copyDraft.shiftMode === 'early', 'копирование: режим early')
ok(copyDraft.proposal === earlyProposal, 'копирование: proposal ранней активации')

const newTrainingSame = resolveTrainerDraftMembershipOpenGate({
  isAdmin: false,
  status: 'draft',
  isNewTraining: true,
  hasMembershipSummary: false,
  earlyOfferOk: true,
  earlyProposal,
})
ok(newTrainingSame.loadState === 'awaiting_activate', 'новая тренировка: тот же early gate')
ok(newTrainingSame.shiftMode === 'early', 'новая тренировка: early')

/* Раньше баг: существующий draft без early оставался ok с пустой плиткой. */
ok(
  resolveTrainerDraftMembershipOpenGate({
    isAdmin: false,
    status: 'draft',
    isNewTraining: false,
    hasMembershipSummary: false,
    earlyOfferOk: false,
  }).loadState === 'ok',
  'существующий draft без upcoming → форма остаётся (не no_membership)',
)

ok(
  resolveTrainerDraftMembershipOpenGate({
    isAdmin: false,
    status: 'draft',
    isNewTraining: true,
    hasMembershipSummary: false,
    earlyOfferOk: false,
  }).loadState === 'no_membership',
  'новая без абона → no_membership',
)

/* Late: у существующего draft — баннер на форме, не полноэкранный gate. */
const lateExisting = resolveTrainerDraftMembershipOpenGate({
  isAdmin: false,
  status: 'draft',
  isNewTraining: false,
  hasMembershipSummary: true,
  lateInspectionStatus: 'offer',
  lateProposal,
})
ok(lateExisting.loadState === 'ok', 'late на существующем draft → loadState ok')
ok(lateExisting.lateDraftOffer === true && lateExisting.shiftMode === 'late', 'late баннер')

const lateNew = resolveTrainerDraftMembershipOpenGate({
  isAdmin: false,
  status: 'draft',
  isNewTraining: true,
  hasMembershipSummary: true,
  lateInspectionStatus: 'offer',
  lateProposal,
})
ok(lateNew.loadState === 'awaiting_activate', 'late на новой → awaiting_activate')

ok(
  resolveTrainerDraftMembershipOpenGate({
    isAdmin: false,
    status: 'draft',
    isNewTraining: false,
    hasMembershipSummary: true,
  }).loadState === 'ok',
  'есть плитка → ok без сдвига',
)

ok(
  resolveTrainerDraftMembershipOpenGate({
    isAdmin: true,
    status: 'draft',
    isNewTraining: false,
    hasMembershipSummary: false,
    earlyOfferOk: true,
    earlyProposal,
  }).loadState === 'ok',
  'админ не гейтит early',
)

ok(
  resolveTrainerDraftMembershipOpenGate({
    isAdmin: false,
    status: 'completed',
    isNewTraining: false,
    hasMembershipSummary: false,
    earlyOfferOk: true,
    earlyProposal,
  }).loadState === 'ok',
  'completed не гейтит',
)

/* «Закончить» без usable, но upcoming есть → sheet, не голая ошибка. */
ok(
  shouldOfferEarlyActivateAfterDebitFail({
    planOk: false,
    isAdmin: false,
    silent: false,
    earlyOfferOk: true,
    earlyProposal,
  }) === true,
  'debit fail + upcoming → предложить early',
)
ok(
  shouldOfferEarlyActivateAfterDebitFail({
    planOk: false,
    isAdmin: false,
    silent: false,
    earlyOfferOk: false,
  }) === false,
  'debit fail без upcoming → не sheet',
)
ok(
  shouldOfferEarlyActivateAfterDebitFail({
    planOk: true,
    earlyOfferOk: true,
    earlyProposal,
  }) === false,
  'debit ok → не sheet',
)
ok(
  shouldOfferEarlyActivateAfterDebitFail({
    planOk: false,
    isAdmin: true,
    earlyOfferOk: true,
    earlyProposal,
  }) === false,
  'админ debit → не early sheet',
)
ok(
  shouldOfferEarlyActivateAfterDebitFail({
    planOk: false,
    silent: true,
    earlyOfferOk: true,
    earlyProposal,
  }) === false,
  'тихий автосейв не открывает sheet',
)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll draft membership gate checks passed')
