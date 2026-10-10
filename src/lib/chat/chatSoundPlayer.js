import { readChatSoundEnabled } from './chatSoundSetting.js'
import { CHAT_SOUNDS, CHAT_WHOOSH, buildWhooshNoise, expandChatTone } from './chatSoundSynthCore.js'

/** Проигрыватель звуков переписки на Web Audio — без аудиофайлов. */

/** Браузер даёт звук только после касания; без касания resume не завершается. */
const RESUME_GRACE_MS = 250

let ctx = null
/** @type {'client' | 'staff' | null} */
let armedSide = null

function audio() {
  if (ctx) return ctx
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  try {
    ctx = new Ctx()
  } catch {
    return null
  }
  return ctx
}

function unlock() {
  if (!armedSide || !readChatSoundEnabled(armedSide)) return
  const c = audio()
  if (c?.state === 'suspended') void c.resume().catch(() => {})
  if (c?.state === 'running') {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
}

/**
 * Экран, где возможен звук, просит браузер разрешить его при ближайшем касании.
 * Входящее приходит по опросу, без касания — без этого оно бы молчало.
 * @param {'client' | 'staff'} side
 */
export function armChatSound(side) {
  if (armedSide) {
    armedSide = side
    return
  }
  armedSide = side
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}

function playVoice(c, t0, v) {
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(v.peak, t0 + 0.012)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur)
  env.connect(c.destination)
  const o = c.createOscillator()
  o.frequency.setValueAtTime(v.freq, t0)
  o.connect(env)
  o.start(t0)
  o.stop(t0 + v.dur + 0.02)
}

function playWhoosh(c, t0) {
  const w = CHAT_WHOOSH
  const noise = buildWhooshNoise(c.sampleRate)
  const buffer = c.createBuffer(1, noise.length, c.sampleRate)
  buffer.getChannelData(0).set(noise)
  const src = c.createBufferSource()
  src.buffer = buffer
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.setValueAtTime(w.q, t0)
  band.frequency.setValueAtTime(w.from, t0)
  band.frequency.exponentialRampToValueAtTime(w.to, t0 + w.dur)
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(w.vol, t0 + w.dur * w.peakAt)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + w.dur)
  src.connect(band).connect(env).connect(c.destination)
  src.start(t0)
}

function schedule(c, tones) {
  for (const t of tones) {
    const t0 = c.currentTime + t.at
    if (t.whoosh) playWhoosh(c, t0)
    else for (const v of expandChatTone(t)) playVoice(c, t0, v)
  }
}

/**
 * @param {'send' | 'incoming' | 'inbox'} name
 * @param {'client' | 'staff'} side
 */
export function playChatSound(name, side) {
  if (document.visibilityState !== 'visible' || !readChatSoundEnabled(side)) return
  const c = audio()
  const tones = CHAT_SOUNDS[name]
  if (!c || !tones) return
  if (c.state === 'running') {
    schedule(c, tones)
    return
  }
  const started = performance.now()
  c.resume()
    .then(() => performance.now() - started < RESUME_GRACE_MS && schedule(c, tones))
    .catch(() => {})
}
