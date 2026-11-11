import {
  captureElementViewportTop,
  restoreElementViewportTop,
} from '../src/lib/ui/preserveElementViewportYCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(captureElementViewportTop(null) === null, 'null el → null')
ok(captureElementViewportTop({}) === null, 'без getBoundingClientRect → null')
ok(captureElementViewportTop({ getBoundingClientRect: () => ({ top: 120 }) }) === 120, 'читает top')
ok(captureElementViewportTop({ getBoundingClientRect: () => ({ top: NaN }) }) === null, 'NaN → null')

const moves = []
const el = { getBoundingClientRect: () => ({ top: 80 }) }
ok(restoreElementViewportTop(el, 120, (x, y) => moves.push([x, y])) === -40, 'поднимает скролл на delta')
ok(moves.length === 1 && moves[0][0] === 0 && moves[0][1] === -40, 'scrollBy(0, delta)')

ok(restoreElementViewportTop(el, 80.5, () => {}) === 0, 'шум ≤1px игнорируется')
ok(restoreElementViewportTop(null, 10, () => {}) === 0, 'null el без сдвига')
ok(restoreElementViewportTop(el, null, () => {}) === 0, 'null saved без сдвига')

console.log('verify-preserve-element-viewport-y: all passed')
