/**
 * Лента уведомлений клиента: виртуальная из plans, unread = !seen, deep_link, закладка kinds.
 */
import {
  CLIENT_NOTIFICATION_KINDS,
  CLIENT_NOTIFICATIONS_PATH,
  buildClientNotificationsFromPlans,
  clientNotificationsBadgeText,
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
  CLIENT_NOTIFICATION_KINDS.rate_training === 'rate_training' &&
    CLIENT_NOTIFICATION_KINDS.rate_membership === 'rate_membership',
  'закладка kinds оценки',
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

console.log('verify-client-notifications: ok')
