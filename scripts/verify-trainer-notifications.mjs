/**
 * Лента уведомлений тренера: из client_plans, unread = клиент с приложением не открыл;
 * без приложения — не в ленте; несколько отправок — одна строка «ещё не открыл».
 */
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

const items = buildTrainerNotificationsFromPlans(plans, clients)
ok(items.length === 2 && items[0].id === 'p2', 'новые сверху')
ok(items[1].kind === 'homework_pending' && !items[1].read_at, 'ещё не открыл')
ok(items[1].title.includes('ещё не открыл') && items[1].title.includes('задание') && items[1].body.includes('Анна'), 'текст ожидания')
ok(items[0].kind === 'nutrition_opened' && items[0].read_at, 'открытый рацион')
ok(items[0].deep_link.includes('/trainer/clients/c2') && items[0].deep_link.includes('nutrition'), 'deep_link')
ok(trainerNotificationsUnreadCount(items) === 1, 'unread только ждущие')
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

const deduped = buildTrainerNotificationsFromPlans(
  [
    { id: 'a1', client_id: 'c1', kind: 'nutrition', sent_at: '2026-10-17T10:00:00Z', client_seen_at: null },
    { id: 'a2', client_id: 'c1', kind: 'nutrition', sent_at: '2026-10-17T12:00:00Z', client_seen_at: null },
  ],
  clients,
  { hasAppByClientId: { c1: true } },
)
ok(deduped.length === 1 && deduped[0].id === 'a2', 'несколько отправок — одна строка (последняя)')

ok(
  trainerNotificationPendingClientIds(plans).includes('c1') && !trainerNotificationPendingClientIds(plans).includes('c2'),
  'pending client ids',
)

console.log('verify-trainer-notifications: ok')
