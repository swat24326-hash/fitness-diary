/**
 * Звуки переписки в WAV — прослушать без браузера: node scripts/render-chat-sounds.mjs
 * Те же формулы, что у проигрывателя (src/lib/chat/chatSoundSynthCore.js). Файлы — qa-screenshots/sounds/.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAT_SOUNDS, CHAT_WHOOSH, buildWhooshNoise, expandChatTone } from '../src/lib/chat/chatSoundSynthCore.js'

const RATE = 44100
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'qa-screenshots', 'sounds')

/** Шум через полосовой фильтр, частота которого едет вверх (как BiquadFilter 'bandpass' в браузере). */
function renderWhoosh(out, n0) {
  const w = CHAT_WHOOSH
  const noise = buildWhooshNoise(RATE)
  const peakSec = w.dur * w.peakAt
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < noise.length; i++) {
    const sec = i / RATE
    const f = w.from * Math.pow(w.to / w.from, sec / w.dur)
    const wc = (2 * Math.PI * f) / RATE
    const alpha = Math.sin(wc) / (2 * w.q)
    const a0 = 1 + alpha
    const x = noise[i]
    const y = (alpha * x - alpha * x2 + 2 * Math.cos(wc) * y1 - (1 - alpha) * y2) / a0
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    const env =
      sec < peakSec
        ? 0.0001 * Math.pow(w.vol / 0.0001, sec / peakSec)
        : w.vol * Math.pow(0.0001 / w.vol, (sec - peakSec) / (w.dur - peakSec))
    out[n0 + i] += y * env
  }
}

function render(tones) {
  const len = Math.ceil((Math.max(...tones.map((t) => t.at + t.dur)) + 0.05) * RATE)
  const out = new Float32Array(len)
  for (const t of tones) {
    const n0 = Math.round(t.at * RATE)
    if (t.whoosh) {
      renderWhoosh(out, n0)
      continue
    }
    for (const v of expandChatTone(t)) {
      const n = Math.round(v.dur * RATE)
      for (let i = 0; i < n; i++) {
        const sec = i / RATE
        const env =
          sec < 0.012
            ? 0.0001 * Math.pow(v.peak / 0.0001, sec / 0.012)
            : v.peak * Math.pow(0.0001 / v.peak, (sec - 0.012) / (v.dur - 0.012))
        out[n0 + i] += Math.sin(2 * Math.PI * v.freq * sec) * env
      }
    }
  }
  return out
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2))
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(RATE, 24)
  h.writeUInt32LE(RATE * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

const NAMES = { incoming: '1-vhodyashee', inbox: '2-konvert', send: '3-otpravka' }
mkdirSync(OUT, { recursive: true })
for (const [key, file] of Object.entries(NAMES)) writeFileSync(join(OUT, `kettle-${file}.wav`), wav(render(CHAT_SOUNDS[key])))
console.log(`render-chat-sounds: ${OUT}`)
