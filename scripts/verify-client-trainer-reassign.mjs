/**
 * node scripts/verify-client-trainer-reassign.mjs
 * Сценарии смены тренера / переезда клуба / подписи клуба / каскада абонов.
 */
import {
  clubMoveConfirmMessage,
  formatTrainerSelectLabel,
  needsCardUniquenessCheckOnClubMove,
  planClientClubMoveRelatedPatches,
  resolveCardNumberForClubMoveCheck,
  resolveClientClubIdForTrainer,
  tabletModeChangeConfirmMessage,
  trainerTabletMode,
} from '../src/lib/admin/clientTrainerReassignCore.js'
import { prepareClientTrainerReassign } from '../src/lib/admin/clientTrainerReassignService.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
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
  'keep client club when trainer missing from catalog',
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
  !needsCardUniquenessCheckOnClubMove({
    oldClubId: 'a',
    newClubId: 'b',
    cardNumber: '',
  }),
  'no check empty card on move',
)

ok(
  resolveCardNumberForClubMoveCheck({
    proposedCardNumber: '9999',
    clientCardNumber: '5838',
  }) === '9999',
  'proposed card wins over old',
)
ok(
  resolveCardNumberForClubMoveCheck({
    proposedCardNumber: '',
    clientCardNumber: '5838',
  }) === '',
  'explicit clear card from form',
)
ok(
  resolveCardNumberForClubMoveCheck({
    clientCardNumber: '5838',
  }) === '5838',
  'fallback to client card',
)

ok(
  clubMoveConfirmMessage({
    oldClubId: 'a',
    newClubId: 'b',
    trainerName: 'Иван',
  })?.includes('Иван'),
  'club move confirm',
)
ok(clubMoveConfirmMessage({ oldClubId: 'a', newClubId: 'a' }) == null, 'no club move')
ok(
  clubMoveConfirmMessage({
    oldClubId: 'a',
    newClubId: 'b',
    trainerName: 'Иван',
    loyaltyNote: 'Сгорят 50 баллов лояльности в старом клубе.',
  })?.includes('50'),
  'club move confirm includes loyalty burn',
)

ok(
  formatTrainerSelectLabel({ id: '1', name: 'Анна', club_id: 'c1' }, { showClub: true }) ===
    'Анна · клуб c1…',
  'label with club id fallback',
)
ok(
  formatTrainerSelectLabel(
    { id: '1', name: 'Анна', club_id: 'c1' },
    { showClub: true, clubNameById: { c1: 'Север' } },
  ) === 'Анна · Север',
  'label with club name map',
)
ok(
  formatTrainerSelectLabel(
    { id: '1', name: 'Анна', club_id: 'c1' },
    { showClub: true, clubNameById: {} },
  ) === 'Анна · клуб c1…',
  'empty club map falls back',
)
ok(formatTrainerSelectLabel({ id: '1', name: 'Анна', club_id: 'c1' }) === 'Анна', 'label plain')

const cascade = planClientClubMoveRelatedPatches({
  oldClubId: 'club-a',
  nextClubId: 'club-b',
  memberships: [
    { id: 'm1', club_id: 'club-a' },
    { id: 'm2', club_id: 'club-b' },
  ],
  trainings: [
    { id: 't1', club_id: 'club-a' },
    { id: 't2', club_id: 'club-b' },
  ],
})
ok(cascade.memberships.length === 1 && cascade.memberships[0].club_id === 'club-b', 'cascade mem')
ok(cascade.trainings.length === 1 && cascade.trainings[0].club_id === 'club-b', 'cascade training')
ok(
  planClientClubMoveRelatedPatches({
    oldClubId: 'a',
    nextClubId: 'a',
    memberships: [{ id: 'm1', club_id: 'a' }],
  }).memberships.length === 0,
  'no cascade same club',
)

const client = { id: 'c1', club_id: 'club-a', trainer_id: 'tr-a', card_number: '5838' }
const catalog = [
  { id: 'tr-a', name: 'Аня', club_id: 'club-a', uses_tablet: true },
  { id: 'tr-b', name: 'Борис', club_id: 'club-b', uses_tablet: true },
]

{
  const r = await prepareClientTrainerReassign({
    client,
    nextTrainerId: 'tr-a',
    trainersCatalog: catalog,
    confirmFn: () => true,
  })
  ok(r.ok && r.club_id === 'club-a', 'same trainer keeps club')
}

{
  const r = await prepareClientTrainerReassign({
    client,
    nextTrainerId: '',
    trainersCatalog: catalog,
    confirmFn: () => true,
  })
  ok(r.ok && r.trainer_id == null && r.club_id === 'club-a', 'clear trainer keeps club')
}

{
  const r = await prepareClientTrainerReassign({
    client,
    nextTrainerId: 'tr-b',
    proposedCardNumber: '9999',
    trainersCatalog: catalog,
    confirmFn: () => true,
    listClientsByClubIdFn: async () => [{ id: 'other', club_id: 'club-b', card_number: '5838' }],
  })
  ok(r.ok === true && r.club_id === 'club-b', 'new free card + club move ok despite old card taken')
}

{
  const r = await prepareClientTrainerReassign({
    client,
    nextTrainerId: 'tr-b',
    proposedCardNumber: '5838',
    trainersCatalog: catalog,
    confirmFn: () => true,
    listClientsByClubIdFn: async () => [{ id: 'other', club_id: 'club-b', card_number: '5838' }],
  })
  ok(r.ok === false && String(r.error || '').length > 0, 'old card conflict blocks move')
}

{
  const r = await prepareClientTrainerReassign({
    client: { ...client, card_number: '5838' },
    nextTrainerId: 'tr-b',
    proposedCardNumber: '',
    trainersCatalog: catalog,
    confirmFn: () => true,
    listClientsByClubIdFn: async () => {
      throw new Error('should not list when card cleared')
    },
  })
  ok(r.ok === true && r.club_id === 'club-b', 'empty proposed card skips uniqueness')
}

{
  const r = await prepareClientTrainerReassign({
    client,
    nextTrainerId: 'tr-b',
    proposedCardNumber: '100',
    trainersCatalog: catalog,
    confirmFn: () => true,
    listClientsByClubIdFn: async () => {
      throw new Error('idb down')
    },
  })
  ok(r.ok === false && String(r.error || '').includes('Sync'), 'list failure blocks move')
}

{
  const r = await prepareClientTrainerReassign({
    client,
    nextTrainerId: 'tr-b',
    trainersCatalog: catalog,
    confirmFn: () => false,
  })
  ok(r.ok === false && r.cancelled === true, 'user cancel club move')
}

{
  let seen = ''
  const r = await prepareClientTrainerReassign({
    client,
    nextTrainerId: 'tr-b',
    trainersCatalog: catalog,
    confirmFn: (msg) => {
      seen = String(msg)
      return false
    },
    loyaltyWarnFn: async () => 'Сгорят 150 баллов лояльности в старом клубе.',
  })
  ok(r.cancelled === true && seen.includes('150') && seen.includes('Борис'), 'reassign confirm shows points')
}

if (failed) process.exit(1)
console.log('\nAll client trainer reassign checks passed')
