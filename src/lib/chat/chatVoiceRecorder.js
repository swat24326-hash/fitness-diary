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
  downsamplePcm,
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

/** Микрофон → куски звука в onData(samples, частота); close — выключить микрофон. */
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
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  const mute = ctx.createGain()
  mute.gain.value = 0
  proc.onaudioprocess = (ev) => onData(ev.inputBuffer.getChannelData(0), ctx.sampleRate)
  source.connect(proc)
  proc.connect(mute)
  mute.connect(ctx.destination)
  return {
    close() {
      proc.onaudioprocess = null
      source.disconnect()
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
  const onData = (data, rate) => {
    const level = chatVoiceLevel(data)
    levels.push(level)
    onLevel?.(level)
    const pcm = pcm16Samples(downsamplePcm(data, rate))
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
