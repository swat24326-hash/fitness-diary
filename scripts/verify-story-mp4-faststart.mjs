/**
 * MP4 faststart: moov перед mdat.
 * node scripts/verify-story-mp4-faststart.mjs
 */
import {
  storyMp4Faststart,
  storyMp4NeedsFaststart,
  storyMp4TopAtoms,
  storyVideoApplyFaststart,
} from '../src/lib/stories/storyMp4FaststartCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    failed += 1
    console.error(`fail: ${msg}`)
  }
}

function atom(type, payload) {
  const body = payload instanceof Uint8Array ? payload : new Uint8Array(payload)
  const size = 8 + body.length
  const buf = new Uint8Array(size)
  buf[0] = (size >>> 24) & 255
  buf[1] = (size >>> 16) & 255
  buf[2] = (size >>> 8) & 255
  buf[3] = size & 255
  buf[4] = type.charCodeAt(0)
  buf[5] = type.charCodeAt(1)
  buf[6] = type.charCodeAt(2)
  buf[7] = type.charCodeAt(3)
  buf.set(body, 8)
  return buf
}

function concat(parts) {
  const n = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(n)
  let w = 0
  for (const p of parts) {
    out.set(p, w)
    w += p.length
  }
  return out
}

const ftyp = atom('ftyp', [0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1])
const mdat = atom('mdat', new Uint8Array(40).fill(7))
const moov = atom('moov', new Uint8Array(24).fill(9))

const already = concat([ftyp, moov, mdat])
ok(!storyMp4NeedsFaststart(already), 'moov до mdat — не нужно')
ok(storyMp4Faststart(already) == null, 'уже ok — null')

const late = concat([ftyp, mdat, moov])
ok(storyMp4NeedsFaststart(late), 'moov после mdat — нужно')
const fixed = storyMp4Faststart(late)
ok(fixed && fixed.length === late.length, 'длина та же')
{
  const types = storyMp4TopAtoms(fixed).map((a) => a.type)
  ok(types.join() === 'ftyp,moov,mdat', `порядок ${types.join()}`)
}

// stco: абсолютный offset в mdat должен вырасти на размер moov
{
  const stcoBody = new Uint8Array(16)
  // version/flags + entry_count=1 + offset=100
  stcoBody[7] = 1
  stcoBody[8] = 0
  stcoBody[9] = 0
  stcoBody[10] = 0
  stcoBody[11] = 100
  const stbl = atom('stbl', atom('stco', stcoBody))
  const minf = atom('minf', stbl)
  const mdia = atom('mdia', minf)
  const trak = atom('trak', mdia)
  const moovStco = atom('moov', trak)
  const lateStco = concat([ftyp, mdat, moovStco])
  const fixedStco = storyMp4Faststart(lateStco)
  ok(!!fixedStco, 'stco remux ok')
  const atoms = storyMp4TopAtoms(fixedStco)
  const moovAtom = atoms.find((a) => a.type === 'moov')
  ok(!!moovAtom && moovAtom.offset < atoms.find((a) => a.type === 'mdat').offset, 'moov перед mdat')
  // найти stco в remux и проверить offset = 100 + moov.size
  const view = new DataView(fixedStco.buffer, fixedStco.byteOffset, fixedStco.byteLength)
  let found = false
  for (let i = moovAtom.offset; i + 8 <= moovAtom.offset + moovAtom.size; i += 1) {
    if (
      fixedStco[i + 4] === 0x73 &&
      fixedStco[i + 5] === 0x74 &&
      fixedStco[i + 6] === 0x63 &&
      fixedStco[i + 7] === 0x6f
    ) {
      const off = view.getUint32(i + 16)
      ok(off === 100 + moovStco.length, `stco ${off} === 100+${moovStco.length}`)
      found = true
      break
    }
  }
  ok(found, 'stco найден')
}

ok(
  storyVideoApplyFaststart(late, 'video/mp4')[4] === 0x66,
  'apply mp4 — ftyp на месте',
)
ok(
  storyVideoApplyFaststart(late, 'video/webm') === late,
  'webm — без изменений',
)

if (failed) {
  console.error(`\nverify-story-mp4-faststart: ${failed} fail`)
  process.exit(1)
}
console.log('verify-story-mp4-faststart: ok')
