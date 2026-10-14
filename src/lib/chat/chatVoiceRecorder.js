/**
 * Запись голосового: сырой звук через Web Audio (MediaRecorder на iPhone пишет mp4, в Chrome — webm,
 * а нужен один формат для всех и для SpeechKit) → 24 кГц → MP3 прямо по ходу записи: 5 минут не копятся в памяти.
 * Кодировщик грузится при первой записи. На паузе и после остановки микрофон гаснет; «дописать» включает его снова
 * и продолжает тот же MP3.
 */
import {
  CHAT_VOICE_DENIED_RU,
  CHAT_VOICE_KBPS,
  CHAT_VOICE_NO_MIC_RU,
  CHAT_VOICE_RATE,
  chatVoiceLevel,
  compressVoiceWave,
  createPcmResampler,
  pcm16Samples,
} from './chatVoiceCore.js'

export function isChatVoiceSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext))
}

function micErrorRu(e) {
  const name = String(e?.name ?? '')
  if (name === 'NotAllowedError' || name === 'SecurityError') return CHAT_VOICE_DENIED_RU
  return CHAT_VOICE_NO_MIC_RU
}

function toBase64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * Звук до кодировщика: гул ниже 80 Гц (бас музыки в зале, стук телефона) — прочь; верх выше ~10 кГц — прочь, чтобы
 * пересчёт в 24 кГц не дал «песка»; мягкий компрессор — тихий голос громче, громкий не хрипит (прибавку громкости
 * компрессор Web Audio делает сам, ~+10 дБ при этих настройках; своя сверху — уже перегруз).
 * Автогромкость браузера выключена: она «плавает», а этот уровень ровный на всю запись.
 */
function voiceChain(ctx) {
  const highpass = Object.assign(ctx.createBiquadFilter(), { type: 'highpass' })
  highpass.frequency.value = 80
  const lowpass = [0, 1].map(() => Object.assign(ctx.createBiquadFilter(), { type: 'lowpass' }))
  lowpass.forEach((f) => (f.frequency.value = 10_500))
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -24
  comp.knee.value = 10
  comp.ratio.value = 4
  comp.attack.value = 0.005
  comp.release.value = 0.25
  const nodes = [highpass, ...lowpass, comp]
  nodes.reduce((a, b) => a.connect(b))
  return { input: highpass, output: comp, nodes }
}

/** Микрофон → куски звука 24 кГц в onData(samples); close — выключить микрофон. */
async function openMic(onData) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    })
  } catch (e) {
    throw new Error(micErrorRu(e))
  }
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
  const source = ctx.createMediaStreamSource(stream)
  const chain = voiceChain(ctx)
  const resample = createPcmResampler(ctx.sampleRate)
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  const mute = ctx.createGain()
  mute.gain.value = 0
  proc.onaudioprocess = (ev) => onData(resample(ev.inputBuffer.getChannelData(0)))
  source.connect(chain.input)
  chain.output.connect(proc)
  proc.connect(mute)
  mute.connect(ctx.destination)
  return {
    close() {
      proc.onaudioprocess = null
      source.disconnect()
      chain.nodes.forEach((n) => n.disconnect())
      proc.disconnect()
      mute.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close().catch(() => {})
    },
  }
}

/**
 * Вызывать из обработчика нажатия (iPhone пускает звук только по касанию).
 * @param {{ onLevel?: (level: number) => void }} [opts]
 * @returns {Promise<{ stop: () => Promise<{ audio: string, seconds: number, wave: number[] }>, pause: () => void, resume: () => Promise<void>,
 *   snapshot: () => Promise<{ audio: string, seconds: number, wave: number[] }>, seconds: () => number, cancel: () => void }>}
 */
export async function startChatVoice({ onLevel } = {}) {
  const lamePromise = import('@breezystack/lamejs')
  /** @type {Uint8Array[]} */
  const parts = []
  /** Звук до загрузки кодировщика — докодируем, как только он придёт. @type {Int16Array[]} */
  let backlog = []
  let encoder = null
  const encode = (pcm) => {
    const mp3 = encoder.encodeBuffer(pcm)
    if (mp3.length) parts.push(new Uint8Array(mp3))
  }
  const levels = []
  let samples = 0
  const onData = (data) => {
    const level = chatVoiceLevel(data)
    levels.push(level)
    onLevel?.(level)
    const pcm = pcm16Samples(data)
    samples += pcm.length
    if (encoder) encode(pcm)
    else backlog.push(pcm)
  }
  let mic = await openMic(onData)
  const ready = lamePromise.then((lame) => {
    encoder = new lame.Mp3Encoder(1, CHAT_VOICE_RATE, CHAT_VOICE_KBPS)
    backlog.forEach(encode)
    backlog = []
  })
  ready.catch(() => {})

  let closed = false
  const micOff = () => {
    mic?.close()
    mic = null
  }
  const current = async () => {
    await ready
    return { audio: toBase64(concat(parts)), seconds: samples / CHAT_VOICE_RATE, wave: compressVoiceWave(levels) }
  }

  return {
    async stop() {
      closed = true
      micOff()
      await ready
      const tail = encoder.flush()
      if (tail.length) parts.push(new Uint8Array(tail))
      return current()
    },
    /** Пауза, как ■ в Telegram: микрофон гаснет, записанное остаётся. */
    pause: micOff,
    /** Дописать — вызывать из нажатия; микрофон запретили — ошибка с понятным текстом. */
    async resume() {
      if (closed || mic) return
      const next = await openMic(onData)
      if (closed) next.close()
      else mic = next
    },
    /** Записанное на сейчас — прослушать на паузе (без хвоста кодировщика: доли секунды, на отправке их добавит stop). */
    snapshot: current,
    seconds: () => samples / CHAT_VOICE_RATE,
    cancel() {
      closed = true
      micOff()
    },
  }
}
