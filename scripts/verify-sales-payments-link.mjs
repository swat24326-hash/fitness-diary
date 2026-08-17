/**
 * node scripts/verify-sales-payments-link.mjs
 */
import {
  buildPaymentClientLinkActions,
  collapsePaymentLinesByCardLastWins,
  describePzMissingFromPaymentsMetaRu,
  inferPackageDurationFromTariff,
  inferPackageMonthsFromTariff,
  isPaymentLinkActionReady,
  isPaymentLinkDurationFromFile,
  isPaymentLinkPackageDurationReady,
  isPaymentLinkPackageMonthsReady,
  matchAzDirectionFromTariff,
  attachPaymentLinkSiblingsAfterCreate,
  paymentLinkMembershipsIncludeHall,
  normalizePaymentLinkPackageMonths,
  parsePaymentLinkCustomPackageMonths,
  paymentLinkMembershipDates,
  PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM,
  paymentLinkPackageMonthsSelectValue,
  markPaymentLinkSameCardSiblingsBlocked,
  partitionPaymentClientLinkNeedWork,
  resolvePzLinkMode,
  siblingPaymentLinkActionsSameCard,
  sortTrainersForPzPaymentLink,
  summarizePaymentClientLinkActions,
  validatePaymentLinkAction,
} from '../src/lib/admin/salesPaymentsLinkCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(inferPackageMonthsFromTariff('12/1 Elite утро') === 1, 'months from 12/1')
ok(inferPackageMonthsFromTariff('8/1 Diamond') === 1, 'months from 8/1')
ok(inferPackageMonthsFromTariff('абонемент 3 мес') === 3, 'months from мес')
ok(inferPackageMonthsFromTariff('') === 1, 'empty tariff → 1')
ok(inferPackageDurationFromTariff('разовое ТЗ').unit === 'days', 'разовое → days')
ok(inferPackageDurationFromTariff('разовое ТЗ').count === 1, 'разовое → 1 day')
ok(inferPackageDurationFromTariff('7 дней').unit === 'days', 'N дн → days')
ok(inferPackageDurationFromTariff('7 дней').count === 7, '7 дней → 7')
ok(inferPackageDurationFromTariff('абонемент 3 мес').unit === 'months', 'мес → months')
ok(inferPackageDurationFromTariff('12/1 Elite утро').count === 1, 'slash still months')
ok(
  paymentLinkMembershipDates({ packageUnit: 'days', packageCount: 1 }, '2026-08-17').end ===
    '2026-08-17',
  '1 day dates start=end',
)
ok(
  paymentLinkMembershipDates({ packageUnit: 'days', packageCount: 7 }, '2026-08-17').end ===
    '2026-08-23',
  '7 day dates inclusive',
)
ok(
  paymentLinkMembershipDates({ packageUnit: 'months', packageCount: 1 }, '2026-07-21').end ===
    '2026-08-21',
  '1 month dates unchanged',
)
ok(normalizePaymentLinkPackageMonths(6) === 6, 'normalize keeps 6')
ok(normalizePaymentLinkPackageMonths(0) === 1, 'normalize 0 → 1')
ok(normalizePaymentLinkPackageMonths('12') === 12, 'normalize string 12')
ok(normalizePaymentLinkPackageMonths(99) === 1, 'normalize out of range → 1')
ok(parsePaymentLinkCustomPackageMonths(4) === 4, 'parse custom 4')
ok(parsePaymentLinkCustomPackageMonths('') === null, 'parse empty → null')
ok(parsePaymentLinkCustomPackageMonths(99) === null, 'parse >36 → null')
ok(parsePaymentLinkCustomPackageMonths(PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM) === null, 'parse sentinel')
ok(isPaymentLinkPackageMonthsReady(4), 'ready custom 4')
ok(!isPaymentLinkPackageMonthsReady(null), 'not ready null')
ok(paymentLinkPackageMonthsSelectValue(1) === '1', 'select preset')
ok(paymentLinkPackageMonthsSelectValue(4) === PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM, 'select custom value')
ok(
  paymentLinkPackageMonthsSelectValue(1, true) === PAYMENT_LINK_PACKAGE_MONTHS_CUSTOM,
  'select force custom',
)

const azTypes = [
  { id: 'b1', code: 'box', name: 'Бокс' },
  { id: 's1', code: 'step', name: 'Степ' },
]
ok(matchAzDirectionFromTariff('10 занятий Бокс', azTypes)?.id === 'b1', 'AZ direction boxing')
ok(matchAzDirectionFromTariff('8 занятий Степ', azTypes)?.id === 's1', 'AZ direction step')
ok(
  matchAzDirectionFromTariff('Бокс', [
    { id: 'long', name: 'Групповые: бокс, степ и всё подряд' },
    { id: 'b1', name: 'Бокс', code: 'box' },
  ])?.id === 'b1',
  'AZ direction does not steal Бокс via long type name',
)

const lines = [
  {
    id: '1',
    include: true,
    hall: 'az',
    cardNumber: '5802',
    clientName: 'Фролов',
    tariffName: '10 занятий Бокс',
    amount: 3600,
    matchStatus: 'none',
  },
  {
    id: '2',
    include: true,
    hall: 'az',
    cardNumber: '5802',
    clientName: 'Фролов',
    tariffName: '8 занятий Степ',
    amount: 4000,
    matchStatus: 'none',
  },
  {
    id: '3',
    include: true,
    hall: 'pz',
    cardNumber: '5776',
    clientName: 'Литвин',
    tariffName: '12/1 Elite',
    amount: 10000,
    matchStatus: 'none',
  },
  {
    id: '4',
    include: true,
    hall: 'pz',
    cardNumber: '1111',
    clientName: 'Уже есть',
    tariffName: '8/1',
    amount: 5000,
    matchStatus: 'one',
    clientId: 'c-exist',
  },
  {
    id: '5',
    include: true,
    hall: 'tz',
    cardNumber: '7199',
    clientName: 'Цымбал',
    tariffName: '',
    amount: 17876,
    matchStatus: 'none',
  },
  {
    id: '6',
    include: true,
    hall: 'pz',
    cardNumber: '7199',
    clientName: 'Цымбал',
    tariffName: '4/1 4 звезды Ф1+1',
    amount: 8800,
    matchStatus: 'none',
  },
]

const collapsed = collapsePaymentLinesByCardLastWins(lines)
ok(collapsed.length === 5, 'collapse by card+hall (PZ+TZ same card kept)')
ok(collapsed.find((l) => l.cardNumber === '5802')?.tariffName.includes('Степ'), 'last AZ direction wins')
ok(
  collapsed.filter((l) => l.cardNumber === '7199').length === 2,
  '7199 keeps both PZ and TZ lines',
)

const actions = buildPaymentClientLinkActions({ lines, azTypes })
ok(actions.find((a) => a.cardNumber === '5802')?.kind === 'az_desk', 'az desk action')
ok(actions.find((a) => a.cardNumber === '5802')?.membershipTypeId === 's1', 'az last direction step')
ok(actions.find((a) => a.cardNumber === '5776')?.kind === 'pz_need_trainer', 'pz needs trainer')
ok(actions.find((a) => a.cardNumber === '1111')?.kind === 'skip_matched', 'matched skip')

const conflictActions = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'c1',
      include: true,
      hall: 'pz',
      cardNumber: '5775',
      clientName: 'Шведов',
      tariffName: '4/1',
      amount: 2968,
      matchStatus: 'conflict',
      matchReason: 'Два или больше клиентов с картой №5775 — разберите вручную',
    },
  ],
  azTypes,
})
ok(conflictActions[0]?.kind === 'card_conflict', 'conflict → no create')
ok(!isPaymentLinkActionReady(conflictActions[0], { id: 't1', uses_tablet: true }), 'conflict not ready')
ok(summarizePaymentClientLinkActions(conflictActions).cardConflict === 1, 'summary conflict')
ok(partitionPaymentClientLinkNeedWork(conflictActions).conflicts.length === 1, 'partition conflicts')
ok(partitionPaymentClientLinkNeedWork(conflictActions).pz.length === 0, 'conflict not in pz create list')
const tzAction = actions.find((a) => a.cardNumber === '7199' && a.kind === 'tz_desk')
const pz7199 = actions.find((a) => a.cardNumber === '7199' && a.kind === 'pz_need_trainer')
ok(tzAction?.kind === 'tz_desk', 'tz desk action')
ok(pz7199?.kind === 'pz_need_trainer', 'same card also PZ action')
ok(tzAction?.packageMonths === 1, 'tz empty tariff defaults 1 month')
ok(tzAction?.packageUnit === 'months', 'tz empty tariff unit months')
ok(tzAction?.packageCount === 1, 'tz empty tariff count 1')

const oneTimeActions = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'ot',
      include: true,
      hall: 'tz',
      cardNumber: 'p563',
      clientName: 'Кашин',
      tariffName: 'разовое ТЗ',
      amount: 750,
      matchStatus: 'none',
    },
  ],
})
ok(oneTimeActions[0]?.packageUnit === 'days', 'разовое ТЗ unit days')
ok(oneTimeActions[0]?.packageCount === 1, 'разовое ТЗ count 1')
ok(oneTimeActions[0]?.packageMonths == null, 'разовое ТЗ no fake months')
ok(oneTimeActions[0]?.durationFromTariff === true, 'разовое marked from file')
ok(isPaymentLinkDurationFromFile(oneTimeActions[0]), 'from-file hint while 1 day')
ok(
  !isPaymentLinkDurationFromFile({ ...oneTimeActions[0], packageUnit: 'months', packageCount: 1 }),
  'from-file hint off after manual months',
)
ok(inferPackageDurationFromTariff('Разовый визит').unit === 'days', 'разовый → days')
ok(inferPackageDurationFromTariff('ТЗ разовое').count === 1, 'ТЗ разовое → 1 day')
ok(inferPackageDurationFromTariff('многоразовый абонемент').unit === 'months', 'многоразовый is not 1 day')
ok(
  !paymentLinkMembershipDates({ packageUnit: 'days', packageCount: 1 }, '').ok,
  'no report date → no membership dates',
)
ok(siblingPaymentLinkActionsSameCard(actions, tzAction).some((a) => a.kind === 'pz_need_trainer'), 'sibling PZ for TZ')
ok(siblingPaymentLinkActionsSameCard(actions, pz7199).some((a) => a.kind === 'tz_desk'), 'sibling TZ for PZ')
ok(
  validatePaymentLinkAction({ ...tzAction, packageUnit: 'months', packageCount: 6, packageMonths: 6 }, null).ok,
  'tz desk ok with overridden months',
)
ok(
  validatePaymentLinkAction({ ...tzAction, packageUnit: 'months', packageCount: 4, packageMonths: 4 }, null).ok,
  'tz desk ok with custom 4 months',
)
ok(
  !validatePaymentLinkAction(
    { ...tzAction, packageUnit: 'months', packageCount: null, packageMonths: null },
    null,
  ).ok,
  'tz desk rejects empty custom months',
)
ok(
  !validatePaymentLinkAction({ ...tzAction, packageUnit: 'months', packageCount: 0, packageMonths: 0 }, null)
    .ok,
  'tz desk rejects months 0',
)
ok(
  validatePaymentLinkAction({ ...tzAction, packageUnit: 'days', packageCount: 1, packageMonths: null }, null)
    .ok,
  'tz desk ok with 1 day',
)
ok(isPaymentLinkPackageDurationReady({ packageUnit: 'days', packageCount: 1 }), 'duration ready 1 day')
ok(!isPaymentLinkPackageDurationReady({ packageUnit: 'days', packageCount: null }), 'duration not ready empty days')

ok(resolvePzLinkMode({ id: 't1', uses_tablet: false }) === 'lite', 'no tablet → lite')
ok(resolvePzLinkMode({ id: 't2', uses_tablet: true }) === 'clip', 'tablet → clip')

const bad = validatePaymentLinkAction({ kind: 'pz_need_trainer', trainerId: '', packageMonths: 1 }, null)
ok(!bad.ok, 'pz without trainer rejected')

const good = validatePaymentLinkAction(
  { kind: 'pz_need_trainer', trainerId: 't1', packageMonths: 1 },
  { id: 't1', uses_tablet: false },
)
ok(good.ok && good.mode === 'lite', 'pz lite ok')
ok(
  !isPaymentLinkActionReady({ kind: 'pz_need_trainer', trainerId: '' }, null),
  'ready false without trainer',
)
ok(
  isPaymentLinkActionReady(
    { kind: 'pz_need_trainer', trainerId: 't1', packageMonths: 1 },
    { id: 't1', uses_tablet: false },
  ),
  'ready true with trainer',
)
ok(
  isPaymentLinkActionReady(
    { kind: 'tz_desk', cardNumber: '1', clientName: 'A', packageMonths: 1 },
    null,
  ),
  'tz desk ready without extra choice',
)
ok(
  !isPaymentLinkActionReady(
    { kind: 'az_desk', cardNumber: '1', clientName: 'A', packageMonths: 1, membershipTypeId: '' },
    null,
  ),
  'az desk not ready without direction',
)
ok(
  isPaymentLinkActionReady(
    {
      kind: 'az_desk',
      cardNumber: '1',
      clientName: 'A',
      packageMonths: 1,
      membershipTypeId: 't-box',
    },
    null,
  ),
  'az desk ready with direction',
)

const deskReadySum = summarizePaymentClientLinkActions([
  { kind: 'tz_desk', cardNumber: '1', clientName: 'A', packageMonths: 1 },
  { kind: 'az_desk', cardNumber: '2', clientName: 'B', packageMonths: 1, membershipTypeId: '' },
  { kind: 'az_desk', cardNumber: '3', clientName: 'C', packageMonths: 1, membershipTypeId: 'x' },
])
ok(deskReadySum.deskPending === 3, 'desk pending 3')
ok(deskReadySum.deskReady === 2, 'deskReady = TZ + AZ with direction')

ok(
  paymentLinkMembershipsIncludeHall([{ hall: 'ТЗ' }], 'tz') === true,
  'hall membership ru tz',
)
ok(
  paymentLinkMembershipsIncludeHall([{ hall: 'pz' }], 'tz') === false,
  'hall membership other hall',
)

const sibAttach = attachPaymentLinkSiblingsAfterCreate(
  [
    { id: 'tz', kind: 'tz_desk', cardNumber: '100', hall: 'tz', status: 'done' },
    { id: 'az', kind: 'az_desk', cardNumber: '100', hall: 'az', status: 'pending' },
    { id: 'other', kind: 'tz_desk', cardNumber: '999', hall: 'tz', status: 'pending' },
  ],
  { id: 'tz', cardNumber: '100' },
  'client-1',
)
ok(sibAttach.find((a) => a.id === 'az')?.attachClientId === 'client-1', 'sibling gets attachClientId')
ok(!sibAttach.find((a) => a.id === 'other')?.attachClientId, 'other card not attached')

const emptyHallsKnown = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'tz-empty-halls',
      include: true,
      hall: 'tz',
      cardNumber: '777',
      clientName: 'Без залов',
      tariffName: '',
      amount: 1,
      matchStatus: 'one',
      clientId: 'c-empty',
      matchedHalls: [],
    },
  ],
})
ok(emptyHallsKnown[0]?.kind === 'tz_desk', 'empty matchedHalls + unknown kind → attach, not skip')
ok(emptyHallsKnown[0]?.attachClientId === 'c-empty', 'empty halls still attach to existing client')

const summary = summarizePaymentClientLinkActions(actions)
ok(summary.pzPending === 2, 'summary pz pending')
ok(summary.matched === 1, 'summary matched')
ok(summary.deskPending === 2, 'summary desk')
ok(summary.pzAmount === 18800, 'summary pz amount')

const parts = partitionPaymentClientLinkNeedWork(actions)
ok(parts.pz.length === 2 && parts.desk.length === 2, 'partition pz/desk')

ok(
  describePzMissingFromPaymentsMetaRu({ count: 3, amount: 28360 }).includes('на сумму'),
  'meta count + sum',
)
ok(describePzMissingFromPaymentsMetaRu({ count: 0 }).includes('Нет ПЗ'), 'meta empty')

const sorted = sortTrainersForPzPaymentLink([
  { id: 'a', name: 'Яков', uses_tablet: true },
  { id: 'b', name: 'Анна', uses_tablet: false },
  { id: 'c', name: 'Борис', uses_tablet: false },
])
ok(sorted[0].id === 'b' && sorted[1].id === 'c', 'no-tablet trainers first')

// —— матрица залов / exclude / sibling block / cross-hall ——
const multiHall = collapsePaymentLinesByCardLastWins([
  { id: 'a', include: true, hall: 'pz', cardNumber: '100', clientName: 'X', tariffName: '8/1', amount: 1, matchStatus: 'none' },
  { id: 'b', include: true, hall: 'tz', cardNumber: '100', clientName: 'X', tariffName: '', amount: 2, matchStatus: 'none' },
  { id: 'c', include: true, hall: 'az', cardNumber: '100', clientName: 'X', tariffName: 'Бокс', amount: 3, matchStatus: 'none' },
  { id: 'd', include: false, hall: 'pz', cardNumber: '100', clientName: 'X', tariffName: 'skip', amount: 9, matchStatus: 'none' },
  { id: 'e', include: true, hall: 'dop', cardNumber: '100', clientName: 'X', tariffName: 'клуб', amount: 9, matchStatus: 'none' },
])
ok(multiHall.length === 3, 'PZ+TZ+AZ kept; dop/include=false dropped')

const multiActions = buildPaymentClientLinkActions({
  lines: [
    { id: 'a', include: true, hall: 'pz', cardNumber: '100', clientName: 'X', tariffName: '8/1', amount: 1, matchStatus: 'none' },
    { id: 'b', include: true, hall: 'tz', cardNumber: '100', clientName: 'X', tariffName: '', amount: 2, matchStatus: 'none' },
    { id: 'c', include: true, hall: 'az', cardNumber: '100', clientName: 'X', tariffName: '10 занятий Бокс', amount: 3, matchStatus: 'none' },
  ],
  azTypes,
})
ok(multiActions.filter((a) => a.kind === 'pz_need_trainer').length === 1, 'multi: PZ action')
ok(multiActions.filter((a) => a.kind === 'tz_desk').length === 1, 'multi: TZ action')
ok(multiActions.filter((a) => a.kind === 'az_desk').length === 1, 'multi: AZ action')

const blocked = markPaymentLinkSameCardSiblingsBlocked(multiActions, multiActions.find((a) => a.kind === 'pz_need_trainer'))
ok(blocked.length === multiActions.length, 'siblings no longer auto-blocked')
ok(
  partitionPaymentClientLinkNeedWork(blocked).desk.length === 2 &&
    partitionPaymentClientLinkNeedWork(blocked).pz.length === 1,
  'all halls stay in needWork',
)

const cross = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'tz1',
      include: true,
      hall: 'tz',
      cardNumber: '555',
      clientName: 'Y',
      tariffName: '',
      amount: 1,
      matchStatus: 'one',
      clientId: 'c-pz',
      matchedHallKind: 'pz',
    },
  ],
})
ok(cross[0]?.kind === 'tz_desk', 'TZ line while card is PZ → attach desk action')
ok(cross[0]?.attachClientId === 'c-pz', 'attachClientId set')
ok(cross[0]?.status === 'pending', 'attach stays pending')
ok(summarizePaymentClientLinkActions(cross).deskPending === 1, 'cross-hall desk pending')
ok(summarizePaymentClientLinkActions(cross).needWork === 1, 'cross-hall needWork')
ok(summarizePaymentClientLinkActions(cross).matched === 0, 'cross-hall not counted as «Уже в базе»')
ok(String(cross[0]?.label || '').includes('абон к карточке'), 'daily report label: attach TZ')

const alreadyAz = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'az-exist',
      include: true,
      hall: 'az',
      cardNumber: '4430',
      clientName: 'Шитая',
      tariffName: 'Фитбол+',
      amount: 3990,
      matchStatus: 'one',
      clientId: 'c-karina',
      matchedHallKind: 'tz',
      matchedHalls: ['tz', 'az'],
    },
  ],
})
ok(alreadyAz[0]?.kind === 'skip_matched', 'AZ payment skipped if AZ membership already exists')
ok(summarizePaymentClientLinkActions(alreadyAz).matched === 1, 'already AZ counted as matched')

// —— дневной отчёт: KPI как на экране «Карточки из оплат» ——
const dayReportBothNew = buildPaymentClientLinkActions({
  lines: [
    {
      id: '7199-pz',
      include: true,
      hall: 'pz',
      cardNumber: '7199',
      clientName: 'Цымбал',
      tariffName: '8/1',
      amount: 10000,
      matchStatus: 'none',
    },
    {
      id: '7199-tz',
      include: true,
      hall: 'tz',
      cardNumber: '7199',
      clientName: 'Цымбал',
      tariffName: '',
      amount: 5000,
      matchStatus: 'none',
    },
  ],
})
const dayKpiNew = summarizePaymentClientLinkActions(dayReportBothNew)
ok(dayKpiNew.matched === 0, 'day report: new card matched=0')
ok(dayKpiNew.pzPending === 1 && dayKpiNew.deskPending === 1, 'day report: PZ+TZ both pending')
ok(dayKpiNew.needWork === 2, 'day report: needWork=2')

const dayReportBothDone = buildPaymentClientLinkActions({
  lines: [
    {
      id: '7199-pz2',
      include: true,
      hall: 'pz',
      cardNumber: '7199',
      clientName: 'Цымбал',
      tariffName: '8/1',
      amount: 1,
      matchStatus: 'one',
      clientId: 'c7199',
      matchedHallKind: 'pz',
    },
    {
      id: '7199-tz2',
      include: true,
      hall: 'tz',
      cardNumber: '7199',
      clientName: 'Цымбал',
      tariffName: '',
      amount: 1,
      matchStatus: 'one',
      clientId: 'c7199',
      matchedHallKind: 'tz',
    },
  ],
})
const dayKpiDone = summarizePaymentClientLinkActions(dayReportBothDone)
ok(dayKpiDone.matched === 2, 'day report: both halls matched')
ok(dayKpiDone.needWork === 0 && dayKpiDone.pzPending === 0 && dayKpiDone.deskPending === 0, 'day report: no needWork')

ok(inferPackageMonthsFromTariff('абонемент 6 мес') === 6, '6 мес from tariff')
ok(parsePaymentLinkCustomPackageMonths('9') === 9, 'custom 9 months ok')

const archivedOnlyRestore = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'arch-1',
      include: true,
      hall: 'pz',
      cardNumber: '9001',
      clientName: 'Архивный',
      tariffName: '8/1',
      amount: 5000,
      matchStatus: 'archived',
      clientId: 'c-arch',
      matchedHallKind: 'pz',
      matchedHalls: ['pz'],
    },
  ],
})
ok(archivedOnlyRestore[0]?.kind === 'restore_archived', 'archived + hall abon → restore only')
ok(archivedOnlyRestore[0]?.needsRestore === true, 'restore flag')
ok(isPaymentLinkActionReady(archivedOnlyRestore[0], null), 'restore ready without trainer')
ok(summarizePaymentClientLinkActions(archivedOnlyRestore).restorePending === 1, 'summary restore')
ok(partitionPaymentClientLinkNeedWork(archivedOnlyRestore).restores.length === 1, 'partition restores')

const archivedNeedAbon = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'arch-2',
      include: true,
      hall: 'tz',
      cardNumber: '9001',
      clientName: 'Архивный',
      tariffName: '',
      amount: 8000,
      matchStatus: 'archived',
      clientId: 'c-arch',
      matchedHallKind: 'pz',
      matchedHalls: ['pz'],
    },
  ],
})
ok(archivedNeedAbon[0]?.kind === 'tz_desk', 'archived without TZ abon → desk + restore')
ok(archivedNeedAbon[0]?.needsRestore === true, 'desk restore flag')
ok(archivedNeedAbon[0]?.attachClientId === 'c-arch', 'attach archived client')
ok(String(archivedNeedAbon[0]?.label || '').includes('архив'), 'label mentions archive')

const archivedPz = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'arch-3',
      include: true,
      hall: 'pz',
      cardNumber: '9003',
      clientName: 'Вернуть ПЗ',
      tariffName: '4/1',
      amount: 3000,
      matchStatus: 'archived',
      clientId: 'c-arch-pz',
      matchedHalls: [],
    },
  ],
})
ok(archivedPz[0]?.kind === 'pz_need_trainer', 'archived PZ without abon → need trainer')
ok(archivedPz[0]?.needsRestore === true, 'PZ restore flag')
ok(!isPaymentLinkActionReady(archivedPz[0], null), 'PZ restore still needs trainer')

// —— критические ветки: архив / дубли / не создать ——
const archivedNoId = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'arch-bad',
      include: true,
      hall: 'pz',
      cardNumber: '9090',
      clientName: 'Без id',
      tariffName: '8/1',
      amount: 1,
      matchStatus: 'archived',
      clientId: null,
    },
  ],
})
ok(archivedNoId[0]?.kind === 'card_conflict', 'archived without clientId → no create')
ok(!isPaymentLinkActionReady(archivedNoId[0], { id: 't1', uses_tablet: true }), 'archived no-id not ready')

const archivedAz = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'arch-az',
      include: true,
      hall: 'az',
      cardNumber: '9004',
      clientName: 'АЗ архив',
      tariffName: '10 занятий Бокс',
      amount: 3600,
      matchStatus: 'archived',
      clientId: 'c-az-arch',
      matchedHalls: [],
    },
  ],
  azTypes,
})
ok(archivedAz[0]?.kind === 'az_desk' && archivedAz[0]?.needsRestore, 'archived AZ → desk restore')
ok(archivedAz[0]?.membershipTypeId === 'b1', 'archived AZ keeps direction from tariff')
ok(validatePaymentLinkAction(archivedAz[0], null).ok, 'archived AZ ready with months')

ok(
  !validatePaymentLinkAction({ kind: 'restore_archived', attachClientId: '' }, null).ok,
  'restore_archived rejects empty id',
)

const archivedSibling = buildPaymentClientLinkActions({
  lines: [
    {
      id: 's-pz',
      include: true,
      hall: 'pz',
      cardNumber: '7777',
      clientName: 'Сиблинг',
      tariffName: '8/1',
      amount: 1,
      matchStatus: 'archived',
      clientId: 'c-sib',
      matchedHalls: ['pz'],
    },
    {
      id: 's-tz',
      include: true,
      hall: 'tz',
      cardNumber: '7777',
      clientName: 'Сиблинг',
      tariffName: '',
      amount: 2,
      matchStatus: 'archived',
      clientId: 'c-sib',
      matchedHalls: ['pz'],
    },
  ],
})
const sibRestore = archivedSibling.find((a) => a.kind === 'restore_archived')
const sibTz = archivedSibling.find((a) => a.kind === 'tz_desk')
ok(sibRestore && sibTz, 'same card: restore PZ abon + TZ attach')
ok(sibTz?.needsRestore === true && sibTz?.attachClientId === 'c-sib', 'TZ sibling restores same archived')
ok(
  siblingPaymentLinkActionsSameCard(archivedSibling, sibRestore).some((a) => a.kind === 'tz_desk'),
  'restore has TZ sibling hint',
)

const conflictBeatsArchive = buildPaymentClientLinkActions({
  lines: [
    {
      id: 'cf',
      include: true,
      hall: 'pz',
      cardNumber: '1',
      clientName: 'X',
      tariffName: '8/1',
      amount: 1,
      matchStatus: 'conflict',
      clientId: 'ignored',
    },
  ],
})
ok(conflictBeatsArchive[0]?.kind === 'card_conflict', 'conflict status wins over any clientId')

const sumArch = summarizePaymentClientLinkActions([...archivedOnlyRestore, ...archivedNeedAbon, ...archivedNoId])
ok(sumArch.restorePending === 1, 'mixed summary: one restore_only')
ok(sumArch.deskPending === 1, 'mixed summary: one desk restore+abon')
ok(sumArch.cardConflict === 1, 'mixed summary: one conflict')
ok(sumArch.needWork === 3, 'mixed summary needWork')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales payments link checks passed')
