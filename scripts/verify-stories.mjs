/**
 * Реклама клуба в сторис: права, клуб, срок, кадры, ключ файла, бан на выкладку.
 */
import {
  STORY_BANNED_RU,
  STORY_BAN_TARGET_RU,
  STORY_FORBIDDEN_RU,
  STORY_DEFAULT_CTA,
  STORY_DEFAULT_LABEL,
  STORY_LIFETIME_DAYS,
  STORY_MAX_DAYS,
  STORY_MAX_FRAMES,
  STORY_OTHER_CLUB_RU,
  STORY_PHOTO_MAX_BYTES,
  STORY_PICK_CLUB_RU,
  STORY_REACT_BAD_RU,
  STORY_REACTIONS,
  STORY_VIDEO_BAD_RU,
  STORY_VIDEO_JSON_RU,
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MAX_SEC,
  canBanClubStoryAuthor,
  canModerateClubStoryPublish,
  canPublishClubStory,
  canPublishClubStoryNow,
  canRemoveClubStory,
  canSeeClubStoryViewers,
  groupClubStoryAuthors,
  isStoryStorageKey,
  publishClubId,
  storyCaptionOk,
  storyCtaOk,
  storyDaysOk,
  storyExpiresAt,
  storyFramesOk,
  storyIsLive,
  storyLabelRu,
  storyMimeIsVideo,
  storyPhotoBytesOk,
  storyPostedShortRu,
  storyReactionNext,
  storyReactionOk,
  storyRingSegments,
  storyStaffKind,
  storyStorageKey,
  storyVideoBytesOk,
  storyVideoSecOk,
  storyViewerKey,
  storyViewerPublic,
  viewClubId,
} from '../src/lib/stories/storyClubCore.js'
import {
  STORY_SWIPE_CLOSE_PX,
  storySwipeIntent,
} from '../src/lib/stories/storyGestureCore.js'
import { storyPublishBatches } from '../src/lib/stories/storyPublishCore.js'
import { storyVideoPublishBody } from '../api/_lib/stories/storyVideoBody.js'
import {
  STORY_EDIT_ASPECT,
  STORY_EDIT_PRESETS,
  STORY_EDIT_ZOOM,
  clampStoryEdit,
  storyEditApplyPreset,
  storyEditDefaults,
  storyEditFilterCss,
  storyEditPanByDelta,
  storyEditSetZoom,
  storyEditSourceRect,
} from '../src/lib/stories/storyEditCore.js'

const CLUB = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const STORY = '33333333-3333-4333-8333-333333333333'
const USER_A = '44444444-4444-4444-8444-444444444444'
const USER_B = '55555555-5555-4555-8555-555555555555'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

console.log('кто')
ok(storyStaffKind('admin') === 'admin' && storyStaffKind('Администратор') === 'admin', 'админ')
ok(storyStaffKind('supervisor') === 'supervisor' && storyStaffKind('управляющий') === 'supervisor', 'управляющий')
ok(storyStaffKind('trainer') === 'staff' && storyStaffKind('sales_manager') === 'staff' && storyStaffKind('') === 'staff', 'остальные — сотрудники')
ok(canPublishClubStory('admin') && canPublishClubStory('supervisor') && canPublishClubStory('staff'), 'выкладывают сотрудники клуба')
ok(canPublishClubStoryNow('staff', false) && !canPublishClubStoryNow('staff', true), 'бан блокирует выкладку')
ok(canModerateClubStoryPublish('admin') && canModerateClubStoryPublish('supervisor') && !canModerateClubStoryPublish('staff'), 'банят админ и управляющий')

console.log('клуб')
ok(publishClubId({ kind: 'staff', ownClubId: CLUB }).clubId === CLUB, 'сотрудник выкладывает в свой клуб')
ok(publishClubId({ kind: 'staff', ownClubId: CLUB, requestedClubId: OTHER }).error === STORY_OTHER_CLUB_RU, 'сотрудник не пишет в чужой клуб')
ok(publishClubId({ kind: 'supervisor', ownClubId: CLUB }).clubId === CLUB, 'управляющий — свой клуб')
ok(publishClubId({ kind: 'supervisor', ownClubId: CLUB, requestedClubId: OTHER }).error === STORY_OTHER_CLUB_RU, 'управляющий не пишет в чужой клуб')
ok(publishClubId({ kind: 'admin', requestedClubId: CLUB }).clubId === CLUB, 'админ выбирает клуб')
ok(publishClubId({ kind: 'admin' }).error === STORY_PICK_CLUB_RU, 'админ без клуба — отказ')
ok(viewClubId({ kind: 'staff', ownClubId: CLUB, requestedClubId: OTHER }).error === STORY_OTHER_CLUB_RU, 'сотрудник не видит чужой клуб')
ok(viewClubId({ kind: 'staff', ownClubId: CLUB }).clubId === CLUB, 'сотрудник видит свой клуб')
ok(viewClubId({ kind: 'admin', requestedClubId: OTHER }).clubId === OTHER, 'админ смотрит выбранный клуб')

console.log('бан')
ok(
  canBanClubStoryAuthor('supervisor', { targetKind: 'staff', targetUserId: USER_A, moderatorUserId: USER_B }).ok,
  'управляющий банит сотрудника',
)
ok(
  canBanClubStoryAuthor('admin', { targetKind: 'staff', targetUserId: USER_A, moderatorUserId: USER_B }).ok,
  'админ банит сотрудника',
)
ok(
  !canBanClubStoryAuthor('staff', { targetKind: 'staff', targetUserId: USER_A, moderatorUserId: USER_B }).ok &&
    canBanClubStoryAuthor('staff', { targetKind: 'staff', targetUserId: USER_A, moderatorUserId: USER_B }).error ===
      STORY_FORBIDDEN_RU,
  'сотрудник не банит',
)
ok(
  !canBanClubStoryAuthor('supervisor', { targetKind: 'admin', targetUserId: USER_A, moderatorUserId: USER_B }).ok &&
    canBanClubStoryAuthor('supervisor', { targetKind: 'admin', targetUserId: USER_A, moderatorUserId: USER_B }).error ===
      STORY_BAN_TARGET_RU,
  'нельзя банить админа',
)
ok(
  !canBanClubStoryAuthor('supervisor', { targetKind: 'staff', targetUserId: USER_A, moderatorUserId: USER_A }).ok,
  'нельзя банить себя',
)
ok(typeof STORY_BANNED_RU === 'string' && STORY_BANNED_RU.includes('запретили'), 'текст бана на русском')

console.log('реакции')
ok(STORY_REACTIONS.length === 6 && STORY_REACTIONS.includes('❤️') && STORY_REACTIONS.includes('🔥'), 'набор как в чате')
ok(storyReactionOk('🔥').emoji === '🔥' && storyReactionOk(null).emoji === null, 'реакция ок / снять')
ok(!storyReactionOk('🍕').ok && storyReactionOk('🍕').error === STORY_REACT_BAD_RU, 'чужой смайлик нельзя')
ok(storyReactionNext(null, '❤️').emoji === '❤️' && storyReactionNext('❤️', '❤️').emoji === null, 'та же снимает')
ok(storyReactionNext('👍', '🔥').emoji === '🔥', 'другая заменяет')
ok(
  storyViewerPublic([{ user_key: `c:${CLUB}`, seen_at: '2026-10-25T10:00:00Z', reaction: '🔥' }], { [`c:${CLUB}`]: 'Анна' })[0]
    .reaction === '🔥',
  'в списке зрителей видна реакция',
)

console.log('кадр и срок')
ok(STORY_LIFETIME_DAYS === 1 && STORY_MAX_DAYS === 1 && STORY_DEFAULT_CTA === 'none' && STORY_DEFAULT_LABEL === 'news', 'выкладка — сутки без кнопки')
ok(storyDaysOk(1) && !storyDaysOk(0) && !storyDaysOk(2) && !storyDaysOk(1.5), 'срок только сутки')
ok(storyFramesOk(1) && storyFramesOk(STORY_MAX_FRAMES) && !storyFramesOk(0) && !storyFramesOk(6), '1…5 кадров')
ok(storyCaptionOk('акция').caption === 'акция' && storyCaptionOk('я'.repeat(201)).ok === false && storyCaptionOk('').caption === '', 'подпись до 200')
ok(storyCtaOk('chat') === 'chat' && storyCtaOk('membership') === 'membership' && storyCtaOk('site') === null, 'старые кнопки в просмотре читаются')
ok(storyLabelRu('promo') === 'Акция' && storyLabelRu('news') === 'Новость', 'подписи кружка')
const one = storyRingSegments([{ id: 'a', seen: false, frames: [{ id: 'f1' }] }])
const two = storyRingSegments([{ id: 'a', seen: false, frames: [{ id: 'f1' }, { id: 'f2' }] }])
const mixed = storyRingSegments([
  { id: 'a', seen: true, frames: [{ id: 'f1' }] },
  { id: 'b', seen: false, frames: [{ id: 'f2' }] },
])
ok(one.length === 1 && one[0].sweep === 1 && one[0].seen === false, 'одно фото — целое яркое кольцо')
ok(two.length === 2 && two.every((s) => !s.seen) && Math.abs(two[0].sweep - two[1].sweep) < 0.001 && two[0].sweep < 0.5, 'два фото — два полукруга')
ok(mixed[0].seen === true && mixed[1].seen === false, 'смотренная дуга тусклая, новая яркая')
ok(storyPhotoBytesOk(STORY_PHOTO_MAX_BYTES) && !storyPhotoBytesOk(STORY_PHOTO_MAX_BYTES + 1), 'фото не больше лимита пачки')
ok(storyVideoBytesOk(STORY_VIDEO_MAX_BYTES) && !storyVideoBytesOk(STORY_VIDEO_MAX_BYTES + 1), 'видео не больше 15 МБ')
ok(storyVideoSecOk(STORY_VIDEO_MAX_SEC) && !storyVideoSecOk(0) && !storyVideoSecOk(61), 'видео 1…60 с')
ok(storyMimeIsVideo('video/mp4') && !storyMimeIsVideo('image/jpeg'), 'mime видео')
ok(typeof STORY_VIDEO_BAD_RU === 'string' && STORY_VIDEO_BAD_RU.includes('60'), 'текст лимита видео')
ok(typeof STORY_VIDEO_JSON_RU === 'string' && STORY_VIDEO_JSON_RU.includes('Видео'), 'видео не через JSON')
ok(
  storyPublishBatches([{ kind: 'photo' }, { kind: 'video' }, { kind: 'photo' }, { kind: 'photo' }]).length === 3,
  'пачки: фото | видео | фото+',
)
ok(
  storyVideoPublishBody({
    body: Buffer.from([1, 2, 3]),
    query: { op: 'publish-video', sec: '12', caption: 'зал' },
  })?.op === 'publish-video',
  'бинарное тело сторис',
)
ok(storyVideoPublishBody({ body: Buffer.from([1]), query: { op: 'send', sec: '3' } }) == null, 'чужой op не сторис')
const now = Date.parse('2026-10-25T12:00:00Z')
const exp = storyExpiresAt(now, STORY_LIFETIME_DAYS)
ok(storyIsLive({ expiresAt: exp, removedAt: null }, now + 1000), 'живая внутри срока')
ok(!storyIsLive({ expiresAt: exp, removedAt: null }, Date.parse(exp)), 'после срока не в ряду')
ok(!storyIsLive({ expiresAt: exp, removedAt: exp }, now), 'снятая не в ряду')
{
  const todayIso = '2026-10-25T09:05:00Z'
  const otherIso = '2026-10-24T09:05:00Z'
  const clock = (iso) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  ok(storyPostedShortRu(todayIso, now) === `сегодня · ${clock(todayIso)}`, 'время шапки — сегодня')
  ok(storyPostedShortRu(otherIso, now) === `24.10 · ${clock(otherIso)}`, 'время шапки — другой день')
}

console.log('жесты')
ok(storySwipeIntent({ dx: 0, dy: STORY_SWIPE_CLOSE_PX }) === 'close', 'свайп вниз — закрыть')
ok(storySwipeIntent({ dx: -80, dy: 10 }) === 'peer-next', 'свайп влево — следующий автор')
ok(storySwipeIntent({ dx: 80, dy: 10 }) === 'peer-prev', 'свайп вправо — предыдущий автор')
ok(storySwipeIntent({ dx: 5, dy: 5 }) === 'none', 'дрожь пальца не жест')

console.log('редактор')
ok(Math.abs(STORY_EDIT_ASPECT - 9 / 16) < 1e-9, 'кадр 9:16')
ok(STORY_EDIT_PRESETS.length >= 4 && STORY_EDIT_PRESETS[0].id === 'orig', 'пресеты цвета')
ok(clampStoryEdit(100, -40, 40) === 40 && clampStoryEdit(-99, -40, 40) === -40, 'clamp тона')
ok(storyEditFilterCss({ brightness: 0, contrast: 0, saturation: 0 }) === 'brightness(100%) contrast(100%) saturate(100%)', 'фильтр как есть')
ok(storyEditFilterCss(storyEditApplyPreset('bright')).includes('brightness(118%)'), 'пресет ярче')
{
  const wide = storyEditSourceRect(1920, 1080, storyEditDefaults())
  ok(Math.abs(wide.sw / wide.sh - STORY_EDIT_ASPECT) < 0.02 && wide.sh === 1080, 'cover широкого — высота целиком')
  const tall = storyEditSourceRect(1080, 1920, { zoom: 1, ox: 0, oy: 0 })
  ok(Math.abs(tall.sw / tall.sh - STORY_EDIT_ASPECT) < 0.02 && tall.sw === 1080, 'cover высокого — ширина целиком')
  const zoomed = storyEditSourceRect(1080, 1920, { zoom: 2, ox: 0, oy: 0 })
  ok(zoomed.sw < tall.sw && zoomed.sh < tall.sh, 'зум уменьшает окно кадра')
  const panned = storyEditPanByDelta(storyEditDefaults(), 0.5, 0)
  ok(panned.ox < 0 && panned.oy === 0, 'жест вправо сдвигает кадр влево по ox')
  ok(storyEditSetZoom(storyEditDefaults(), 9).zoom === STORY_EDIT_ZOOM.max, 'зум клампится')
}

console.log('файл')
const key = storyStorageKey(CLUB, STORY, 0, 'image/jpeg')
ok(key === `story/${CLUB}/${STORY}/0.jpg` && isStoryStorageKey(key), 'ключ в папке story/')
ok(isStoryStorageKey(storyStorageKey(CLUB, STORY, 1, 'video/mp4')), 'ключ видео mp4')
ok(!isStoryStorageKey('voice/att/u-1/a.jpg') && !isStoryStorageKey(`story/${CLUB}/${STORY}/0.svg`), 'чужой ключ не отдаём')
ok(storyViewerKey('client', CLUB) === `c:${CLUB}` && storyViewerKey('staff', CLUB) === `u:${CLUB}`, 'кто смотрел — клиент и сотрудник отдельно')
const viewers = storyViewerPublic(
  [
    { user_key: `c:${CLUB}`, seen_at: '2026-10-25T10:00:00Z' },
    { user_key: `u:${OTHER}`, seen_at: '2026-10-25T12:00:00Z' },
    { user_key: 'guest', seen_at: '2026-10-25T13:00:00Z' },
  ],
  { [`c:${CLUB}`]: 'Анна', [`u:${OTHER}`]: 'Иван' },
)
ok(
  viewers.length === 2 && viewers[0].name === 'Иван' && viewers[0].side === 'staff' && viewers[1].name === 'Анна' && !JSON.stringify(viewers).includes(CLUB),
  'список зрителей — имена своего клуба, без сырого id',
)
ok(storyViewerPublic([{ user_key: `c:${CLUB}`, seen_at: null }], {})[0].name === 'Клиент', 'без имени остаётся «Клиент»')
ok(!canRemoveClubStory('admin', { authorId: OTHER, userId: CLUB }) && !canRemoveClubStory('supervisor', { authorId: OTHER, userId: CLUB }), 'чужую снимает только автор')
ok(!canRemoveClubStory('staff', { authorId: OTHER, userId: CLUB }), 'сотрудник чужую не снимает')
ok(canRemoveClubStory('staff', { authorId: CLUB, userId: CLUB }) && canRemoveClubStory('admin', { authorId: CLUB, userId: CLUB }), 'автор снимает свою')
ok(canSeeClubStoryViewers({ authorId: CLUB, userId: CLUB }) && !canSeeClubStoryViewers({ authorId: OTHER, userId: CLUB }), 'кто смотрел — только у своих')
const rails = groupClubStoryAuthors(
  [
    { id: '1', author_id: OTHER, author_name: 'Админ', seen: true, views: 9 },
    { id: '2', author_id: CLUB, author_name: 'Тренер', seen: false, views: 3 },
    { id: '3', author_id: OTHER, author_name: 'Админ', seen: false, views: 1 },
  ],
  { myUserId: CLUB },
)
ok(rails.length === 2 && rails[0].mine && rails[0].author_id === CLUB && rails[0].views === 3, 'свои кружок слева, просмотры свои')
ok(rails[1].author_id === OTHER && rails[1].stories.length === 2 && rails[1].views == null && rails[1].unseen, 'чужой кружок без чужих просмотров')

if (failed) {
  console.error(`\nverify-stories: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-stories: ok')
