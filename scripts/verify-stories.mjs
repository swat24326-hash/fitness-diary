/**
 * Реклама клуба в сторис: права, клуб, срок, кадры, ключ файла.
 */
import {
  STORY_FORBIDDEN_RU,
  STORY_MAX_DAYS,
  STORY_MAX_FRAMES,
  STORY_OTHER_CLUB_RU,
  STORY_PHOTO_MAX_BYTES,
  STORY_PICK_CLUB_RU,
  canPublishClubStory,
  canRemoveClubStory,
  isStoryStorageKey,
  publishClubId,
  storyCaptionOk,
  storyCtaOk,
  storyDaysOk,
  storyExpiresAt,
  storyFramesOk,
  storyIsLive,
  storyLabelRu,
  storyPhotoBytesOk,
  storyStaffKind,
  storyStorageKey,
  storyViewerKey,
  viewClubId,
} from '../src/lib/stories/storyClubCore.js'

const CLUB = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const STORY = '33333333-3333-4333-8333-333333333333'

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
ok(storyStaffKind('trainer') === 'staff' && storyStaffKind('sales_manager') === 'staff' && storyStaffKind('') === 'staff', 'остальные смотрят')
ok(canPublishClubStory('admin') && canPublishClubStory('supervisor') && !canPublishClubStory('staff'), 'выкладывают админ и управляющий')

console.log('клуб')
ok(publishClubId({ kind: 'staff', ownClubId: CLUB }).ok === false && publishClubId({ kind: 'staff', ownClubId: CLUB }).error === STORY_FORBIDDEN_RU, 'тренер не выкладывает')
ok(publishClubId({ kind: 'supervisor', ownClubId: CLUB }).clubId === CLUB, 'управляющий — свой клуб')
ok(publishClubId({ kind: 'supervisor', ownClubId: CLUB, requestedClubId: OTHER }).error === STORY_OTHER_CLUB_RU, 'управляющий не пишет в чужой клуб')
ok(publishClubId({ kind: 'admin', requestedClubId: CLUB }).clubId === CLUB, 'админ выбирает клуб')
ok(publishClubId({ kind: 'admin' }).error === STORY_PICK_CLUB_RU, 'админ без клуба — отказ')
ok(viewClubId({ kind: 'staff', ownClubId: CLUB, requestedClubId: OTHER }).error === STORY_OTHER_CLUB_RU, 'сотрудник не видит чужой клуб')
ok(viewClubId({ kind: 'staff', ownClubId: CLUB }).clubId === CLUB, 'сотрудник видит свой клуб')
ok(viewClubId({ kind: 'admin', requestedClubId: OTHER }).clubId === OTHER, 'админ смотрит выбранный клуб')

console.log('кадр и срок')
ok(storyDaysOk(1) && storyDaysOk(STORY_MAX_DAYS) && !storyDaysOk(0) && !storyDaysOk(STORY_MAX_DAYS + 1) && !storyDaysOk(1.5), 'срок 1…7 суток')
ok(storyFramesOk(1) && storyFramesOk(STORY_MAX_FRAMES) && !storyFramesOk(0) && !storyFramesOk(6), '1…5 кадров')
ok(storyCaptionOk('акция').caption === 'акция' && storyCaptionOk('я'.repeat(201)).ok === false && storyCaptionOk('').caption === '', 'подпись до 200')
ok(storyCtaOk('chat') === 'chat' && storyCtaOk('membership') === 'membership' && storyCtaOk('site') === null, 'кнопка — чат или абонемент')
ok(storyLabelRu('promo') === 'Акция' && storyLabelRu('news') === 'Новость', 'подписи кружка')
ok(storyPhotoBytesOk(STORY_PHOTO_MAX_BYTES) && !storyPhotoBytesOk(STORY_PHOTO_MAX_BYTES + 1), 'фото не больше лимита пачки')
const now = Date.parse('2026-10-25T12:00:00Z')
const exp = storyExpiresAt(now, 2)
ok(storyIsLive({ expiresAt: exp, removedAt: null }, now + 1000), 'живая внутри срока')
ok(!storyIsLive({ expiresAt: exp, removedAt: null }, Date.parse(exp)), 'после срока не в ряду')
ok(!storyIsLive({ expiresAt: exp, removedAt: exp }, now), 'снятая не в ряду')

console.log('файл')
const key = storyStorageKey(CLUB, STORY, 0, 'image/jpeg')
ok(key === `story/${CLUB}/${STORY}/0.jpg` && isStoryStorageKey(key), 'ключ в папке story/')
ok(!isStoryStorageKey('voice/att/u-1/a.jpg') && !isStoryStorageKey(`story/${CLUB}/${STORY}/0.svg`), 'чужой ключ не отдаём')
ok(storyViewerKey('client', CLUB) === `c:${CLUB}` && storyViewerKey('staff', CLUB) === `u:${CLUB}`, 'кто смотрел — клиент и сотрудник отдельно')
ok(canRemoveClubStory('supervisor', { authorId: OTHER, userId: CLUB }) && canRemoveClubStory('admin', { authorId: OTHER, userId: CLUB }), 'админ и управляющий снимают')
ok(!canRemoveClubStory('staff', { authorId: OTHER, userId: CLUB }), 'тренер чужую не снимает')

if (failed) {
  console.error(`\nverify-stories: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-stories: ok')
