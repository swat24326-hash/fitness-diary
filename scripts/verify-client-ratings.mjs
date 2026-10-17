/**
 * Оценка после последней тренировки абонемента: триггер, score 0.5, тексты, лента, staff alert.
 */
import {
  CLIENT_RATING_COPY,
  CLIENT_RATING_KINDS,
  formatRatingScoreRu,
  normalizeRatingScore,
  publicClientRating,
  scoreFromStarRatio,
  shouldAskMembershipRating,
} from '../src/lib/client/clientRatingCore.js'
import {
  CLIENT_RATING_STAFF_ALERT_BELOW,
  adminInboxRatingsPath,
  buildStaffRatingAlertPush,
  publicAdminRatingRow,
  shouldAlertStaffOnClientRating,
} from '../src/lib/client/clientRatingAdminCore.js'
import {
  CLIENT_NOTIFICATION_KINDS,
  buildClientNotifications,
  clientNotificationsUnreadCount,
} from '../src/lib/client/clientNotificationsCore.js'
import { buildMembershipRatingPushPayload } from '../api/_lib/clientRatings/clientRatingJob.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(shouldAskMembershipRating({ total_trainings: 12, used_trainings: 12 }), '12/12 → спросить')
ok(shouldAskMembershipRating({ total_trainings: 8, used_trainings: 8 }), '8/8 → спросить')
ok(!shouldAskMembershipRating({ total_trainings: 12, used_trainings: 11 }), '11/12 → ещё рано')
ok(!shouldAskMembershipRating({ total_trainings: 0, used_trainings: 5 }), 'безлимит → не спрашиваем')
ok(!shouldAskMembershipRating({ total_trainings: null, used_trainings: 1 }), 'total null → нет')

ok(normalizeRatingScore(4.5) === 4.5, '4.5 ok')
ok(normalizeRatingScore(3) === 3, '3 ok')
ok(normalizeRatingScore(4.7) === 4.5, '4.7 → 4.5')
ok(normalizeRatingScore(0.5) == null, '0.5 слишком мало')
ok(normalizeRatingScore(5.5) == null, '5.5 слишком много')
ok(formatRatingScoreRu(4.5) === '4,5', 'подпись 4,5')

ok(scoreFromStarRatio(0) === 1, 'левый край → минимум 1')
ok(scoreFromStarRatio(0.1) === 1, 'чуть справа → 1')
ok(scoreFromStarRatio(0.5) === 3 || scoreFromStarRatio(0.5) === 2.5, 'середина ~2.5–3')
ok(scoreFromStarRatio(1) === 5, 'правый край → 5')
ok(scoreFromStarRatio(0.85) === 4.5 || scoreFromStarRatio(0.85) === 5, 'почти справа → 4.5+')

ok(CLIENT_RATING_COPY.membership.title === 'Оцените прошедшие тренировки', 'заголовок')
ok(CLIENT_RATING_KINDS.membership === 'membership', 'kind membership')

const pub = publicClientRating({
  id: 'r1',
  kind: 'membership',
  requested_at: '2026-10-16T12:00:00Z',
  answered_at: null,
})
ok(pub?.deep_link === '/me/rate/r1' && !pub.read_at, 'публичная строка + deep link')

const answered = publicClientRating({
  id: 'r1',
  kind: 'membership',
  requested_at: '2026-10-16T12:00:00Z',
  answered_at: '2026-10-16T13:00:00Z',
  score: 4.5,
})
ok(answered?.read_at && answered.body.includes('4,5'), 'отвеченная → прочитана')

const feed = buildClientNotifications(
  {
    homework: {
      id: 'hw',
      kind: 'homework',
      sent_at: '2026-10-15T09:00:00Z',
      seen: true,
      summary: { title: 'Спина', count: 4 },
    },
  },
  [pub],
)
ok(feed.some((i) => i.kind === CLIENT_NOTIFICATION_KINDS.rate_membership), 'лента: оценка')
ok(clientNotificationsUnreadCount(feed) === 1, 'unread только оценка')

const push = buildMembershipRatingPushPayload({ clubName: 'Ядро', ratingId: 'r1' })
ok(push.body === 'Оцените прошедшие тренировки' && push.url === '/me/rate/r1', 'push payload')

ok(CLIENT_RATING_STAFF_ALERT_BELOW === 4, 'порог staff alert = 4')
ok(shouldAlertStaffOnClientRating(3.5), '3,5 → push персоналу')
ok(shouldAlertStaffOnClientRating(3), '3 → push персоналу')
ok(!shouldAlertStaffOnClientRating(4), '4 → без push')
ok(!shouldAlertStaffOnClientRating(4.5), '4,5 → без push')
ok(!shouldAlertStaffOnClientRating(null), 'без score → без push')

const adminRow = publicAdminRatingRow({
  id: 'r1',
  kind: 'membership',
  client_id: 'c1',
  client_name: 'Анна',
  club_id: 'cl1',
  club_name: 'Ядро',
  score: 3.5,
  comment: 'Мало внимания',
  answered_at: '2026-10-16T13:00:00Z',
})
ok(adminRow?.low && adminRow.score_label === '3,5' && adminRow.client_name === 'Анна', 'строка админки low')

const okRow = publicAdminRatingRow({
  id: 'r2',
  kind: 'membership',
  client_name: 'Игорь',
  score: 5,
  answered_at: '2026-10-16T14:00:00Z',
})
ok(okRow && !okRow.low, '5★ не low')

ok(adminInboxRatingsPath('/admin/inbox', { rid: 'r1' }) === '/admin/inbox?tab=ratings&rid=r1', 'путь admin')
ok(adminInboxRatingsPath('/club/inbox', { rid: 'r1' }) === '/club/inbox?tab=ratings&rid=r1', 'путь club')

const staffPush = buildStaffRatingAlertPush({
  clientName: 'Анна',
  score: 3.5,
  comment: 'Мало внимания',
  url: '/admin/inbox?tab=ratings&rid=r1',
})
ok(
  staffPush.title === 'Оценка абонемента' &&
    staffPush.body.includes('3,5') &&
    staffPush.url.includes('tab=ratings'),
  'staff push payload',
)

console.log('verify-client-ratings: ok')
