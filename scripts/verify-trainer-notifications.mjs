/**
 * Лента уведомлений тренера: из client_plans; pending только при has_app;
 * тренер «прочитал» локально — строка остаётся без unread; без ссылки в карточку.
 */
import {
  applyTrainerNotificationDismissals,
  isTrainerPendingNotificationKind,
  withTrainerPendingDismissal,
} from '../src/lib/trainer/trainerNotificationDismissCore.js'
import {
  COACH_NOTIFICATIONS_PATH,
  TRAINER_NOTIFICATIONS_PATH,
  buildTrainerNotificationsFromPlans,
  trainerInboxHeaderBadgeCount,
  trainerInboxHeaderLabelRu,
  trainerNotificationPendingClientIds,
  trainerNotificationsBadgeText,
  trainerNotificationsEntryLabelRu,
  trainerNotificationsUnreadCount,
} from '../src/lib/trainer/trainerNotificationsCore.js'
import { homeworkAutoPlanId } from '../src/lib/homework/auto/homeworkAutoPlanId.js'
import { nutritionAutoPlanId } from '../src/lib/nutrition/nutritionAutoPlanId.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(TRAINER_NOTIFICATIONS_PATH === '/trainer/notifications', 'путь планшета')
ok(COACH_NOTIFICATIONS_PATH === '/coach/notifications', 'путь телефона')

const clients = { c1: { name: 'Анна Иванова' }, c2: { name: 'Борис' }, c3: { name: 'Семенов Д.А.' } }
const plans = [
  { id: 'p1', client_id: 'c1', kind: 'homework', sent_at: '2026-10-08T09:00:00Z', client_seen_at: null },
  { id: 'p2', client_id: 'c2', kind: 'nutrition', sent_at: '2026-10-09T10:00:00Z', client_seen_at: '2026-10-09T11:00:00Z' },
]

const empty = buildTrainerNotificationsFromPlans([], clients)
ok(empty.length === 0 && trainerNotificationsUnreadCount(empty) === 0, 'пусто')

const itemsUnknown = buildTrainerNotificationsFromPlans(plans, clients)
ok(itemsUnknown.length === 0, 'ручные отправки — и задание, и рацион — в ленту не попадают')
ok(!buildTrainerNotificationsFromPlans(plans, clients)[0]?.deep_link, 'без deep_link — сообщение, не ссылка')
ok(trainerNotificationsUnreadCount(itemsUnknown) === 0, 'ручное не считается непрочитанным')
ok(trainerNotificationsBadgeText(1) === '1', 'счётчик')
ok(trainerNotificationsEntryLabelRu(1) === 'Уведомления: новых 1', 'aria')
ok(trainerInboxHeaderBadgeCount(2, 1) === 3, 'бейдж шапки: сумма')
ok(trainerInboxHeaderBadgeCount(0, 0) === 0, 'бейдж шапки: пусто')
ok(trainerInboxHeaderLabelRu(2, 1).includes('Планёрка') && trainerInboxHeaderLabelRu(2, 1).includes('клиент'), 'aria входящих')

const noApp = buildTrainerNotificationsFromPlans(
  [
    { id: 'n1', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-17T10:00:00Z', client_seen_at: null },
    { id: 'n2', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-17T11:00:00Z', client_seen_at: null },
    { id: 'n3', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-17T12:00:00Z', client_seen_at: null },
    { id: 'n4', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-17T13:00:00Z', client_seen_at: null },
  ],
  clients,
  { hasAppByClientId: { c3: false } },
)
ok(noApp.length === 0, 'без приложения — не в ленте «От клиентов»')

const unknownPending = buildTrainerNotificationsFromPlans(
  [{ id: 'u1', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-17T10:00:00Z', client_seen_at: null }],
  clients,
  { hasAppByClientId: {} },
)
ok(unknownPending.length === 0, 'статус неизвестен — pending не показываем')

const deduped = buildTrainerNotificationsFromPlans(
  [
    { id: 'a1', client_id: 'c1', kind: 'nutrition', sent_at: '2026-10-17T10:00:00Z', client_seen_at: null },
    { id: 'a2', client_id: 'c1', kind: 'nutrition', sent_at: '2026-10-17T12:00:00Z', client_seen_at: null },
  ],
  clients,
  { hasAppByClientId: { c1: true } },
)
ok(deduped.length === 0, 'несколько ручных рационов в ленту не попадают')

const openedSpam = buildTrainerNotificationsFromPlans(
  [
    { id: 'o1', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-10T10:00:00Z', client_seen_at: '2026-10-11T10:00:00Z' },
    { id: 'o2', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-12T10:00:00Z', client_seen_at: '2026-10-13T10:00:00Z' },
    { id: 'o3', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-14T10:00:00Z', client_seen_at: '2026-10-15T10:00:00Z' },
    { id: 'o4', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-16T10:00:00Z', client_seen_at: null },
  ],
  clients,
  { hasAppByClientId: { c3: true } },
)
ok(openedSpam.length === 0, 'открытый вручную рацион не становится строкой «прочитал»')

const sun = '2026-10-18'
const autoId = nutritionAutoPlanId('c3', sun)
const autoSent = buildTrainerNotificationsFromPlans(
  [
    {
      id: autoId,
      client_id: 'c3',
      kind: 'nutrition',
      sent_at: '2026-10-18T07:10:00.000Z',
      client_seen_at: '2026-10-18T12:00:00.000Z',
    },
    { id: 'manual-later', client_id: 'c3', kind: 'nutrition', sent_at: '2026-10-20T07:10:00.000Z', client_seen_at: null },
  ],
  clients,
  { hasAppByClientId: { c3: true } },
)
ok(
  autoSent.length === 1 && autoSent[0].id === autoId && autoSent[0].title === 'Рацион отправлен' && !autoSent[0].read_at,
  'авто-рацион: «Рацион отправлен», даже если клиент уже открыл; поздняя ручная отправка строку не подменяет',
)
ok(autoSent[0].body.includes('Семенов'), 'в строке имя клиента')

ok(trainerNotificationPendingClientIds(plans).length === 0, 'has_app для ленты больше не спрашиваем')

ok(isTrainerPendingNotificationKind('homework_pending') && !isTrainerPendingNotificationKind('homework_sent'), 'старый pending-kind')
const hwId = homeworkAutoPlanId('c1', sun)
const autoHw = buildTrainerNotificationsFromPlans(
  [
    {
      id: hwId,
      client_id: 'c1',
      kind: 'homework',
      sent_at: '2026-10-18T07:10:00.000Z',
      client_seen_at: '2026-10-18T12:00:00.000Z',
    },
  ],
  clients,
)
ok(autoHw.length === 1 && autoHw[0].title === 'Задание отправлено' && !autoHw[0].read_at, 'авто-задание: «Задание отправлено», без «прочитал»')
const acknowledged = withTrainerPendingDismissal({}, hwId, '2026-10-18T15:00:00Z')
const afterAck = applyTrainerNotificationDismissals(autoHw, acknowledged)
ok(afterAck.length === 1, 'тренер открыл — строка остаётся')
ok(afterAck[0].read_at === '2026-10-18T15:00:00Z', 'точка гаснет')
ok(trainerNotificationsUnreadCount(afterAck) === 0, 'после прочтения бейдж клиентов чистый')

console.log('verify-trainer-notifications: ok')
