/**
 * node scripts/verify-client-trainer-reassign.mjs
 */
import {
  clubMoveConfirmMessage,
  formatTrainerSelectLabel,
  needsCardUniquenessCheckOnClubMove,
  resolveClientClubIdForTrainer,
  tabletModeChangeConfirmMessage,
  trainerTabletMode,
} from '../src/lib/admin/clientTrainerReassignCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(trainerTabletMode({ uses_tablet: true }) === true, 'tablet true')
ok(trainerTabletMode({ uses_tablet: false }) === false, 'lite')
ok(trainerTabletMode({}) === null, 'unknown mode')

ok(
  tabletModeChangeConfirmMessage({
    fromTrainer: { uses_tablet: true },
    toTrainer: { uses_tablet: false },
  })?.includes('без планшета'),
  'confirm to lite',
)
ok(
  tabletModeChangeConfirmMessage({
    fromTrainer: { uses_tablet: false },
    toTrainer: { uses_tablet: true },
  })?.includes('планшетом'),
  'confirm to tablet',
)
ok(
  tabletModeChangeConfirmMessage({
    fromTrainer: { uses_tablet: true },
    toTrainer: { uses_tablet: true },
  }) == null,
  'same mode no confirm',
)

ok(
  resolveClientClubIdForTrainer({
    clientClubId: 'club-a',
    trainerRow: { club_id: 'club-b' },
  }) === 'club-b',
  'club from trainer',
)
ok(
  resolveClientClubIdForTrainer({
    clientClubId: 'club-a',
    trainerRow: null,
  }) === 'club-a',
  'keep client club',
)

ok(
  needsCardUniquenessCheckOnClubMove({
    oldClubId: 'a',
    newClubId: 'b',
    cardNumber: '100',
  }),
  'card check on move',
)
ok(
  !needsCardUniquenessCheckOnClubMove({
    oldClubId: 'a',
    newClubId: 'a',
    cardNumber: '100',
  }),
  'no check same club',
)

ok(
  clubMoveConfirmMessage({
    oldClubId: 'a',
    newClubId: 'b',
    trainerName: 'Иван',
  })?.includes('Иван'),
  'club move confirm',
)
ok(
  clubMoveConfirmMessage({ oldClubId: 'a', newClubId: 'a' }) == null,
  'no club move',
)

ok(
  formatTrainerSelectLabel({ id: '1', name: 'Анна', club_id: 'c1' }, { showClub: true }) ===
    'Анна · клуб c1…',
  'label with club',
)
ok(formatTrainerSelectLabel({ id: '1', name: 'Анна', club_id: 'c1' }) === 'Анна', 'label plain')

console.log('\nAll client trainer reassign checks passed')
