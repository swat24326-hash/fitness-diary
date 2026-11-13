/**
 * Компакт → pull сторис на телефоне: пороги, ось, snap, скролл.
 */
import {
  STORY_RAIL_COLLAPSE_SCROLL_PX,
  STORY_RAIL_DEAD_PX,
  STORY_RAIL_PULL_PX,
  STORY_RAIL_SNAP,
  clamp01,
  storyRailExpandAtTop,
  storyRailExpandAxis,
  storyRailExpandIsPhone,
  storyRailExpandProgress,
  storyRailExpandSnap,
  storyRailExpandStayOpen,
} from '../src/lib/stories/storyRailExpandCore.js'
import { MSGR_PHONE_MAX } from '../src/lib/chat/messengerColumnsCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

ok(STORY_RAIL_PULL_PX > STORY_RAIL_DEAD_PX, 'pull дальше dead')
ok(STORY_RAIL_SNAP > 0 && STORY_RAIL_SNAP < 1, 'snap внутри 0..1')

ok(clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.5) === 0.5, 'clamp01')

ok(storyRailExpandIsPhone({ width: 390, msgrMode: null }), 'узкий экран без msgr — телефон')
ok(storyRailExpandIsPhone({ width: 390, msgrMode: 'phone' }), 'msgr--phone')
ok(storyRailExpandIsPhone({ width: 1400, msgrMode: 'phone' }), 'msgr--phone даже на широком')
ok(!storyRailExpandIsPhone({ width: 390, msgrMode: 'tablet' }), 'планшет — без жеста')
ok(!storyRailExpandIsPhone({ width: 1400, msgrMode: 'monitor' }), 'монитор — без жеста')
ok(!storyRailExpandIsPhone({ width: MSGR_PHONE_MAX + 1, msgrMode: null }), 'шире phone max без msgr')
ok(storyRailExpandIsPhone({ width: MSGR_PHONE_MAX, msgrMode: null }), 'ровно phone max')

ok(storyRailExpandAxis({ dx: 0, dy: 0 }) === 'none', 'шум — none')
ok(storyRailExpandAxis({ dx: 2, dy: 2 }) === 'none', 'внутри dead — none')
ok(storyRailExpandAxis({ dx: 5, dy: 40 }) === 'pull', 'вниз — pull')
ok(storyRailExpandAxis({ dx: 40, dy: 5 }) === 'pan-x', 'вбок — pan-x')

ok(storyRailExpandProgress({ dy: 0, from: 0 }) === 0, 'без движения — 0')
ok(storyRailExpandProgress({ dy: STORY_RAIL_PULL_PX, from: 0 }) === 1, 'полный pull — 1')
ok(storyRailExpandProgress({ dy: STORY_RAIL_PULL_PX / 2, from: 0 }) === 0.5, 'половина')
ok(storyRailExpandProgress({ dy: -STORY_RAIL_PULL_PX, from: 1 }) === 0, 'вверх из раскрытого — 0')
ok(storyRailExpandProgress({ dy: 1000, from: 0.9 }) === 1, 'не выше 1')

ok(storyRailExpandSnap(STORY_RAIL_SNAP) === 1, 'на пороге — open')
ok(storyRailExpandSnap(STORY_RAIL_SNAP - 0.01) === 0, 'ниже порога — compact')
ok(storyRailExpandSnap(1) === 1 && storyRailExpandSnap(0) === 0, 'края snap')

ok(storyRailExpandAtTop(0) && storyRailExpandAtTop(1), 'у верха')
ok(!storyRailExpandAtTop(2), 'не у верха')

ok(storyRailExpandStayOpen({ scrollTop: 0, expanded: true }), 'раскрыт у верха')
ok(!storyRailExpandStayOpen({ scrollTop: STORY_RAIL_COLLAPSE_SCROLL_PX, expanded: true }), 'скролл — схлопнуть')
ok(!storyRailExpandStayOpen({ scrollTop: 0, expanded: false }), 'и так компакт')

console.log('OK verify-story-rail-expand')
