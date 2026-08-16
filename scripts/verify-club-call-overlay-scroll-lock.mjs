/**
 * Verify: nested scroll lock + release order.
 */
import {
  acquireClubCallOverlayScrollLock,
  isClubCallSheetBackdropOpen,
} from '../src/lib/admin/clubCallOverlayScrollLock.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

globalThis.document = {
  body: { style: { overflow: '' } },
  querySelector: () => null,
}

const r1 = acquireClubCallOverlayScrollLock()
ok(globalThis.document.body.style.overflow === 'hidden', 'first lock hides scroll')
const r2 = acquireClubCallOverlayScrollLock()
ok(globalThis.document.body.style.overflow === 'hidden', 'nested still hidden')
r2()
ok(globalThis.document.body.style.overflow === 'hidden', 'inner release keeps lock')
r1()
ok(globalThis.document.body.style.overflow === '', 'outer release restores')
ok(isClubCallSheetBackdropOpen() === false, 'no backdrop in stub')

console.log('\nAll club-call overlay scroll lock checks passed')
