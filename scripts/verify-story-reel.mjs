/**
 * Просмотр сторис: полоска не листает видео раньше времени; blob URL вместо data:.
 */
import { STORY_PHOTO_SEC, storyMimeIsVideo } from '../src/lib/stories/storyClubCore.js'
import { storyReelAdvanceOnFill, storyReelFillSec } from '../src/lib/stories/storyReelCore.js'
import { revokeStoryFrameUrl, storyFrameObjectUrl } from '../src/lib/stories/storyFrameSrcCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

ok(storyReelAdvanceOnFill('image/jpeg'), 'фото — полоска листает')
ok(!storyReelAdvanceOnFill('video/mp4'), 'видео — полоска не листает')
ok(!storyReelAdvanceOnFill('video/webm'), 'webm — полоска не листает')

ok(storyReelFillSec({ mime: 'image/jpeg', sec: null, photoSec: STORY_PHOTO_SEC }) === STORY_PHOTO_SEC, 'фото — 5 с')
ok(storyReelFillSec({ mime: 'video/mp4', sec: null, photoSec: STORY_PHOTO_SEC }) === null, 'видео без sec — ждать')
ok(storyReelFillSec({ mime: 'video/mp4', sec: 14, photoSec: STORY_PHOTO_SEC }) === 14, 'видео с sec')
ok(storyReelFillSec({ mime: 'video/mp4', sec: 0.4, photoSec: STORY_PHOTO_SEC }) === null, 'дробь <1 — ждать')

ok(storyMimeIsVideo('video/mp4'), 'mime video')

const tiny = Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]).toString('base64')
const url = storyFrameObjectUrl({ mime: 'video/mp4', data: tiny })
ok(String(url).startsWith('blob:'), 'кадр — blob URL')
revokeStoryFrameUrl(url)
revokeStoryFrameUrl('data:video/mp4;base64,xx')

console.log('OK verify-story-reel')
