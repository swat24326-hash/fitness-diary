/**
 * Range + stream-файл сторис.
 * node scripts/verify-story-media-range.mjs
 */
import {
  storyMediaContentRange,
  storyMediaIsStreamFile,
  storyMediaParseRange,
} from '../src/lib/stories/storyMediaRangeCore.js'
import { storyFrameObjectUrl, revokeStoryFrameUrl } from '../src/lib/stories/storyFrameSrcCore.js'
import {
  signStoryMediaToken,
  storyMediaSrcPath,
  verifyStoryMediaToken,
} from '../api/_lib/stories/storyMediaTokenCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    failed += 1
    console.error(`fail: ${msg}`)
  }
}

const size = 1000
ok(storyMediaParseRange('', size) == null, 'без Range — null')
ok(storyMediaParseRange('bytes=0-99', size)?.start === 0, '0-99 start')
ok(storyMediaParseRange('bytes=0-99', size)?.end === 99, '0-99 end')
ok(storyMediaParseRange('bytes=900-', size)?.end === 999, 'open end')
ok(storyMediaParseRange('bytes=-100', size)?.start === 900, 'suffix')
ok(storyMediaParseRange('bytes=1000-1001', size) == null, 'за концом — null')
ok(storyMediaContentRange({ start: 0, end: 99, size: 1000 }) === 'bytes 0-99/1000', 'Content-Range')

ok(storyMediaIsStreamFile({ stream: true, src: '/api/story-media?t=x', mime: 'video/mp4' }), 'stream file')
ok(!storyMediaIsStreamFile({ blob: new Blob() }), 'blob — не stream')

{
  const src = storyFrameObjectUrl({ stream: true, src: '/api/story-media?t=abc', mime: 'video/mp4' })
  ok(src === '/api/story-media?t=abc', 'object url = stream path')
  revokeStoryFrameUrl(src)
}

{
  const secret = 'test-secret-for-story-media-verify'
  const key = 'story/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/ffffffff-1111-2222-3333-444444444444/0.mp4'
  // isStoryStorageKey — check format
  const token = signStoryMediaToken({ key, mime: 'video/mp4', nowSec: 1_700_000_000 }, secret)
  ok(typeof token === 'string' && token.split('.').length === 3, 'sign token')
  const path = storyMediaSrcPath(token)
  ok(path.startsWith('/api/story-media?t='), 'src path')
  const good = verifyStoryMediaToken(token, secret, 1_700_000_000)
  ok(good.ok && good.key === key && good.mime === 'video/mp4', 'verify ok')
  const expired = verifyStoryMediaToken(token, secret, 1_700_000_000 + 3 * 60 * 60)
  ok(!expired.ok, 'expired')
  ok(signStoryMediaToken({ key: 'bad', mime: 'video/mp4' }, secret) == null, 'bad key — null')
}

if (failed) {
  console.error(`\nverify-story-media-range: ${failed} fail`)
  process.exit(1)
}
console.log('verify-story-media-range: ok')
