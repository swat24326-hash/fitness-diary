/**
 * Запись с микрофона для голосового ввода: сырой звук через Web Audio (MediaRecorder на iPhone пишет mp4,
 * а SpeechKit берёт PCM) → 16 кГц, 16 бит → base64. Звук только в памяти, после остановки микрофон гаснет.
 */
import {
  CHAT_DICTATION_DENIED_RU,
  CHAT_DICTATION_NO_MIC_RU,
  chatDictationLevel,
  downsamplePcm,
  pcm16Bytes,
} from './chatDictationCore.js'

export function isChatDictationSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext))
}

function micErrorRu(e) {
  const name = String(e?.name ?? '')
  if (name === 'NotAllowedError' || name === 'SecurityError') return CHAT_DICTATION_DENIED_RU
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return CHAT_DICTATION_NO_MIC_RU
  return CHAT_DICTATION_NO_MIC_RU
}

function toBase64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Вызывать из обработчика нажатия (iPhone пускает звук только по касанию).
 * @param {{ onLevel?: (level: number) => void }} [opts]
 * @returns {Promise<{ stop: () => { audio: string, seconds: number }, cancel: () => void }>}
 */
export async function startChatDictation({ onLevel } = {}) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
  /** @type {Float32Array[]} */
  const chunks = []
  let length = 0
  proc.onaudioprocess = (ev) => {
    const data = new Float32Array(ev.inputBuffer.getChannelData(0))
    chunks.push(data)
    length += data.length
    onLevel?.(chatDictationLevel(data))
  }
  source.connect(proc)
  proc.connect(mute)
  mute.connect(ctx.destination)

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    proc.onaudioprocess = null
    source.disconnect()
    proc.disconnect()
    mute.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close().catch(() => {})
  }

  return {
    stop() {
      const rate = ctx.sampleRate
      close()
      const all = new Float32Array(length)
      let at = 0
      for (const c of chunks) {
        all.set(c, at)
        at += c.length
      }
      const pcm = pcm16Bytes(downsamplePcm(all, rate))
      return { audio: toBase64(pcm), seconds: length / rate }
    },
    cancel: close,
  }
}
