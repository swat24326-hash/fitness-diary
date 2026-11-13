/**
 * Полоска сторис: фото листает сама; видео — только ended; guard открытия; ложный ended.
 * node scripts/verify-story-reel.mjs
 */
import { STORY_PHOTO_SEC } from '../src/lib/stories/storyClubCore.js'
import {
  STORY_OPEN_GUARD_MS,
  storyReelAcceptVideoEnded,
  storyReelAdvanceOnFill,
  storyReelFillSec,
  storyReelOpenBlocked,
} from '../src/lib/stories/storyReelCore.js'
import { storyWarmTargets } from '../src/lib/stories/storyWarmTargetsCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    failed += 1
    console.error(`fail: ${msg}`)
  }
}

ok(STORY_OPEN_GUARD_MS >= 400 && STORY_OPEN_GUARD_MS <= 800, 'guard ~0.5 с')
ok(storyReelOpenBlocked(1000, 1500), 'пока guard — блок')
ok(!storyReelOpenBlocked(1600, 1500), 'после guard — можно листать')

ok(storyReelAdvanceOnFill('image/jpeg'), 'фото — полоска листает')
ok(!storyReelAdvanceOnFill('video/mp4'), 'видео — полоска не листает')
ok(!storyReelAdvanceOnFill('video/webm'), 'webm — полоска не листает')

ok(storyReelFillSec({ mime: 'image/jpeg', sec: null, photoSec: STORY_PHOTO_SEC }) === STORY_PHOTO_SEC, 'фото — 5 с')
ok(storyReelFillSec({ mime: 'video/mp4', sec: null, photoSec: STORY_PHOTO_SEC }) === null, 'видео без sec — ждать')
ok(storyReelFillSec({ mime: 'video/mp4', sec: 14, photoSec: STORY_PHOTO_SEC }) === 14, 'видео с sec')
ok(storyReelFillSec({ mime: 'video/mp4', sec: 0.4, photoSec: STORY_PHOTO_SEC }) === null, 'дробь <1 — ждать')
ok(storyReelFillSec({ mime: 'video/mp4', sec: 90, photoSec: STORY_PHOTO_SEC }) === 60, 'потолок полоски 60 с')

ok(!storyReelAcceptVideoEnded({ hasStarted: false, currentTime: 0, duration: 10 }), 'без play — не ended')
ok(!storyReelAcceptVideoEnded({ hasStarted: true, currentTime: 0.1, duration: 10 }), 'ранний нуль — не ended')
ok(storyReelAcceptVideoEnded({ hasStarted: true, currentTime: 9.8, duration: 10 }), 'досмотрели — ok')

{
  const groups = [
    {
      stories: [
        { id: 's1', seen: false, frames: [{ id: 'f1' }, { id: 'f2' }] },
        { id: 's2', seen: true, frames: [{ id: 'f3' }] },
      ],
    },
    { stories: [{ id: 's3', seen: true, frames: [{ id: 'f4' }] }] },
  ]
  const warm = storyWarmTargets(groups, { maxAuthors: 2, maxFrames: 1 })
  ok(warm.length === 2 && warm[0].frameId === 'f1' && warm[1].frameId === 'f4', 'прогрев: первый кадр непросмотренной / первой')
}

if (failed) {
  console.error(`\nverify-story-reel: ${failed} fail`)
  process.exit(1)
}
console.log('verify-story-reel: ok')
