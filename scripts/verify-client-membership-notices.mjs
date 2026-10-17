/**
 * Оповещение «абонемент заканчивается»: окно ≤5 дней, текст с клубом, дедуп-ключ, unread/read.
 */
import { MEMBERSHIP_EXPIRING_WITHIN_DAYS } from '../src/lib/clientListSignals.js'
import {
  CLIENT_MEMBERSHIP_NOTICE_ACTIVE_KIND,
  MEMBERSHIP_EXPIRING_NOTICE_BODY,
  buildMembershipExpiringNoticeCopy,
  isMembershipNoticeWindow,
  pickExpiringMembershipForNotice,
  publicMembershipNotice,
} from '../src/lib/client/clientMembershipNoticeCore.js'
import {
  CLIENT_NOTIFICATION_KINDS,
  buildClientNotifications,
  clientNotificationsUnreadCount,
} from '../src/lib/client/clientNotificationsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed++
    console.error(`FAIL: ${msg}`)
  }
}

ok(MEMBERSHIP_EXPIRING_WITHIN_DAYS === 5, 'окно истечения = 5 дней')
ok(CLIENT_MEMBERSHIP_NOTICE_ACTIVE_KIND === 'expiring', 'активный kind — expiring')
ok(MEMBERSHIP_EXPIRING_NOTICE_BODY.includes('{days_left}') && MEMBERSHIP_EXPIRING_NOTICE_BODY.includes('{days_word}'), 'текст со сроком')
ok(!MEMBERSHIP_EXPIRING_NOTICE_BODY.includes('{club_name}'), 'клуб не в теле — он в push title')
ok(isMembershipNoticeWindow(10 * 60) && isMembershipNoticeWindow(11 * 60 + 59) && !isMembershipNoticeWindow(12 * 60), 'окно 10:00–12:00')

const today = '2026-10-17'
const mem = {
  id: 'm1',
  client_id: 'c1',
  start_date: '2026-09-01',
  end_date: '2026-10-20',
  total_trainings: 12,
  used_trainings: 3,
}
const hit = pickExpiringMembershipForNotice([mem], today)
ok(hit && hit.daysLeft === 3 && hit.endDate === '2026-10-20', 'отбор: до конца 3 дня → кандидат')
ok(!pickExpiringMembershipForNotice([{ ...mem, end_date: '2026-11-01' }], today), 'далеко до конца — не кандидат')
ok(!pickExpiringMembershipForNotice([{ ...mem, end_date: '2026-10-10', used_trainings: 12 }], today), 'уже не usable — не кандидат')

const copy = buildMembershipExpiringNoticeCopy({ daysLeft: 5 })
ok(
  copy.body === 'Ваш абонемент заканчивается через 5 дней.',
  'текст: только срок',
)
ok(copy.title === 'Абонемент заканчивается', 'заголовок короткий')
ok(
  buildMembershipExpiringNoticeCopy({ daysLeft: 1 }).body ===
    'Ваш абонемент заканчивается через 1 день.',
  '1 день — склонение',
)

const pub = publicMembershipNotice({
  id: 'n1',
  kind: 'expiring',
  title: copy.title,
  body: copy.body,
  created_at: '2026-10-17T07:00:00Z',
  read_at: null,
})
ok(pub && !pub.read_at && pub.deep_link === '/me/notifications', 'публичная строка непрочитана')

const feed = buildClientNotifications(null, null, { membershipNotices: [pub] })
ok(feed.length === 1 && feed[0].kind === CLIENT_NOTIFICATION_KINDS.membership_expiring, 'в ленте kind membership_expiring')
ok(clientNotificationsUnreadCount(feed) === 1, 'непрочитанное в бейдже')
ok(clientNotificationsUnreadCount(buildClientNotifications(null, null, { membershipNotices: [{ ...pub, read_at: '2026-10-17T08:00:00Z' }] })) === 0, 'после read_at — бейдж 0')

if (failed) {
  console.error(`verify-client-membership-notices: ${failed} FAIL`)
  process.exit(1)
}
console.log('verify-client-membership-notices: all passed')
