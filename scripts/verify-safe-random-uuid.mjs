/**
 * node scripts/verify-safe-random-uuid.mjs
 */
import {
  createSafeRandomUuidPolyfill,
  isSafeRandomUuidPolyfill,
  isUuidLike,
  safeRandomUuid,
} from '../src/lib/safeRandomUuid.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

ok(isUuidLike('550e8400-e29b-41d4-a716-446655440000') === true, 'uuid v4-ish accepted')
ok(isUuidLike('lid-1-abc') === false, 'fallback prefix not uuid-like')

const viaApi = safeRandomUuid({
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
})
ok(viaApi === '11111111-1111-4111-8111-111111111111', 'uses randomUUID when present')

const bytes = new Uint8Array(16)
for (let i = 0; i < 16; i += 1) bytes[i] = i
const viaValues = safeRandomUuid({
  getRandomValues: (buf) => {
    buf.set(bytes)
    return buf
  },
})
ok(isUuidLike(viaValues) === true, 'getRandomValues path is uuid-shaped')
ok(viaValues.charAt(14) === '4', 'uuid version nibble 4')

const last = safeRandomUuid({})
ok(String(last).startsWith('lid-'), 'no crypto → lid fallback')

const insecure = {
  getRandomValues: (buf) => {
    for (let i = 0; i < buf.length; i += 1) buf[i] = (i + 3) & 0xff
    return buf
  },
}
insecure.randomUUID = createSafeRandomUuidPolyfill(insecure)
ok(isSafeRandomUuidPolyfill(insecure.randomUUID) === true, 'polyfill is marked')
const ids = []
for (let i = 0; i < 20; i += 1) ids.push(safeRandomUuid(insecure))
ok(ids.length === 20 && ids.every((id) => isUuidLike(id)), 'polyfill + safeRandomUuid no recurse')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('verify-safe-random-uuid: all passed')
