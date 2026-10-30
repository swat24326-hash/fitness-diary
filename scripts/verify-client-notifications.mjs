/**
 * Лента уведомлений клиента: виртуальная из plans, unread = !seen, deep_link, закладка kinds.
 */
import {
  CLIENT_NOTIFICATION_KINDS,
  CLIENT_NOTIFICATIONS_PATH,
  buildClientNotifications,
  buildClientNotificationsFromInbox,
  buildClientNotificationsFromPlans,
  clientNotificationsBadgeText,
  clientNotificationsBellCount,
  clientNotificationsEntryLabelRu,
  clientNotificationsUnreadCount,
} from '../src/lib/client/clientNotificationsCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const TZ = 'Europe/Moscow'
const hw = {
  id: 'p-hw',
  kind: 'homework',
  sent_at: '2026-10-08T09:00:00Z',
  trainer_name: 'Анна Иванова',
  seen: false,
  summary: { title: 'Спина', count: 6 },
}
const nu = {
  id: 'p-nu',
  kind: 'nutrition',
  sent_at: '2026-10-09T10:00:00Z',
  trainer_name: 'Анна Иванова',
  seen: true,
  client_seen_at: '2026-10-09T11:00:00Z',
  summary: { kcal: 1800 },
}

ok(CLIENT_NOTIFICATIONS_PATH === '/me/notifications', 'путь ленты')
ok(
  CLIENT_NOTIFICATION_KINDS.rate_membership === 'rate_membership' &&
    CLIENT_NOTIFICATION_KINDS.rate_homework === 'rate_homework',
  'kinds оценки абонемента и ДЗ',
)

const empty = buildClientNotificationsFromPlans(null)
ok(empty.length === 0 && clientNotificationsUnreadCount(empty) === 0, 'нет plans — пустая лента')

const onlyHw = buildClientNotificationsFromPlans({ homework: hw, nutrition: null }, { timeZone: TZ })
ok(onlyHw.length === 1 && onlyHw[0].kind === 'homework_sent', 'задание → homework_sent')
ok(onlyHw[0].deep_link === '/me/task' && onlyHw[0].title === 'Новое задание', 'deep_link и заголовок задания')
ok(onlyHw[0].body.includes('Спина') && onlyHw[0].body.includes('Анна'), 'тело: заголовок и тренер')
ok(!onlyHw[0].read_at && clientNotificationsUnreadCount(onlyHw) === 1, 'неоткрытое — unread')

const both = buildClientNotificationsFromPlans({ homework: hw, nutrition: nu }, { timeZone: TZ })
ok(both.length === 2 && both[0].id === 'p-nu', 'новые сверху (рацион позже)')
ok(both[0].kind === 'nutrition_sent' && both[0].deep_link === '/me/nutrition', 'рацион → nutrition_sent')
ok(both[0].read_at === '2026-10-09T11:00:00Z' && both[0].body.includes('1800'), 'прочитанный рацион + ккал')
ok(clientNotificationsUnreadCount(both) === 1, 'unread только по непрочитанным')

const seenHw = buildClientNotificationsFromPlans({
  homework: { ...hw, seen: true },
  nutrition: nu,
})
ok(clientNotificationsUnreadCount(seenHw) === 0, 'оба открыты — ноль непрочитанных')
ok(clientNotificationsEntryLabelRu(1) === 'Уведомления: новых 1', 'aria при новых')
ok(clientNotificationsEntryLabelRu(0) === 'Уведомления', 'aria без новых')
ok(clientNotificationsBadgeText(1) === '1' && clientNotificationsBadgeText(12) === '9+', 'счётчик на колокольчике')
ok(clientNotificationsBadgeText(0) === '', 'без непрочитанных — без числа')

const inboxItems = [
  { id: 'd1', kind: 'survey', title: 'Как вам зал?', sent_at: '2026-10-10T12:00:00Z', attention: true, open: true, reward_points: 50 },
  { id: 'd2', kind: 'notice', title: '1 января выходной', sent_at: '2026-10-07T08:00:00Z', attention: false },
]
const fromInbox = buildClientNotificationsFromInbox(inboxItems)
ok(fromInbox.length === 2 && fromInbox[0].kind === 'club_survey', 'опрос клуба → club_survey')
ok(fromInbox[0].deep_link === '/me/inbox/d1' && !fromInbox[0].read_at, 'опрос ведёт в карточку, unread')
ok(fromInbox[1].kind === 'club_notice' && fromInbox[1].read_at, 'объявление прочитано')
const merged = buildClientNotifications({ homework: hw }, null, { inboxItems, timeZone: TZ })
ok(merged.length === 3 && merged[0].id === 'inbox:d1', 'единая лента: опрос сверху по дате')
ok(clientNotificationsBellCount({ plans: { homework: hw }, inboxAttention: 2 }) === 3, 'колокольчик: планы + inbox_attention')

const noTrainer = buildClientNotifications({ homework: hw }, null, {
  inboxItems,
  timeZone: TZ,
  includeFromTrainer: false,
})
ok(noTrainer.length === 2 && noTrainer.every((it) => it.id.startsWith('inbox:')), 'solo АЗ — ДЗ не в ленте')
ok(
  clientNotificationsBellCount({ plans: { homework: hw }, inboxAttention: 1, includeFromTrainer: false }) === 1,
  'колокольчик solo АЗ — без ДЗ',
)

console.log('verify-client-notifications: ok')
