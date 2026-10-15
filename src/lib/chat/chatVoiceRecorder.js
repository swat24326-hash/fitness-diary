/**
 * Запись голосового, как кружок (chatVideoRecorder.js): микрофон → MediaRecorder, звук кодирует сам телефон (Opus,
 * на iPhone — AAC) вне страницы — тормоза экрана запись не рвут. Громкость для волны читает отдельный анализатор.
 * На паузе микрофон гаснет, отрезок закрывается куском; «дописать» — новый кусок. Склеит и сделает MP3 сервер.
 */
import {
  CHAT_VOICE_BAD_RU,
  CHAT_VOICE_DENIED_RU,
  CHAT_VOICE_NO_MIC_RU,
  CHAT_VOICE_RECORD_BPS,
  chatVoiceLevel,
  compressVoiceWave,
  pickVoiceRecorderMime,
} from './chatVoiceCore.js'

const LEVEL_MS = 100
const isTypeSupported = (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)

export function isChatVoiceSupported() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return false
  return Boolean(navigator.mediaDevices?.getUserMedia) && pickVoiceRecorderMime(isTypeSupported) !== null
}

function micErrorRu(e) {
  const name = String(e?.name ?? '')
  if (name === 'NotAllowedError' || name === 'SecurityError') return CHAT_VOICE_DENIED_RU
  return CHAT_VOICE_NO_MIC_RU
}

/** Громкость для волны: анализатор только читает звук, в запись ничего не идёт. */
function levelMeter(stream, onLevel) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return () => {}
  const ctx = new Ctx()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(analyser)
  analyser.connect(mute)
  mute.connect(ctx.destination)
  const buf = new Float32Array(analyser.fftSize)
  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buf)
    onLevel(chatVoiceLevel(buf))
  }, LEVEL_MS)
  return () => {
    window.clearInterval(timer)
    source.disconnect()
    void ctx.close().catch(() => {})
  }
}

/**
 * Один отрезок записи: микрофон включён, пока не закрыли. Настройки — как у кружков.
 * @returns {Promise<{ elapsed: () => number, close: () => Promise<Blob | null>, cancel: () => void }>}
 */
async function openSegment(mime, onLevel) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    })
  } catch (e) {
    throw new Error(micErrorRu(e))
  }
  const off = () => stream.getTracks().forEach((t) => t.stop())
  const chunks = []
  let recorder
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: CHAT_VOICE_RECORD_BPS })
    recorder.ondataavailable = (ev) => ev.data?.size && chunks.push(ev.data)
    recorder.start(1000)
  } catch {
    off()
    throw new Error(CHAT_VOICE_BAD_RU)
  }
  const meterOff = levelMeter(stream, onLevel)
  const startedAt = performance.now()
  let endedAt = null
  const end = () => {
    endedAt ??= performance.now()
    meterOff()
    off()
  }
  return {
    elapsed: () => ((endedAt ?? performance.now()) - startedAt) / 1000,
    close() {
      endedAt ??= performance.now()
      return new Promise((resolve) => {
        const done = () => {
          end()
          const type = String(recorder.mimeType || mime).split(';')[0]
          resolve(chunks.length ? new Blob(chunks, { type }) : null)
        }
        recorder.onstop = done
        recorder.onerror = done
        if (recorder.state === 'inactive') done()
        else recorder.stop()
      })
    },
    cancel() {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      end()
    },
  }
}

/**
 * Вызывать из обработчика нажатия (iPhone пускает микрофон и звук только по касанию).
 * Результат: parts — куски по порядку, seconds — длительность всех кусков, wave — 48 столбиков.
 * @param {{ onLevel?: (level: number) => void }} [opts]
 * @returns {Promise<{ stop: () => Promise<{ parts: Blob[], seconds: number, wave: number[] }>, pause: () => void, resume: () => Promise<void>,
 *   snapshot: () => Promise<{ parts: Blob[], seconds: number, wave: number[] }>, seconds: () => number, cancel: () => void }>}
 */
export async function startChatVoice({ onLevel } = {}) {
  const mime = pickVoiceRecorderMime(isTypeSupported)
  if (!mime) throw new Error(CHAT_VOICE_BAD_RU)
  const levels = []
  const onSegmentLevel = (level) => {
    levels.push(level)
    onLevel?.(level)
  }
  /** @type {Blob[]} */
  const parts = []
  let doneSec = 0
  let segment = await openSegment(mime, onSegmentLevel)
  /** Закрытие отрезка (пауза) — снимок и отправка ждут, пока кусок допишется. */
  let closing = Promise.resolve()
  let closed = false

  const closeSegment = () => {
    const seg = segment
    if (!seg) return closing
    segment = null
    const blobReady = seg.close()
    doneSec += seg.elapsed()
    closing = closing.then(async () => {
      const blob = await blobReady
      if (blob) parts.push(blob)
    })
    return closing
  }
  const seconds = () => doneSec + (segment?.elapsed() ?? 0)
  const current = async () => {
    await closing
    if (!parts.length) throw new Error(CHAT_VOICE_BAD_RU)
    return { parts: [...parts], seconds: seconds(), wave: compressVoiceWave(levels) }
  }

  return {
    async stop() {
      closed = true
      await closeSegment()
      return current()
    },
    /** Пауза, как ■ в Telegram: микрофон гаснет, записанное остаётся. */
    pause: () => void closeSegment(),
    /** Дописать — вызывать из нажатия; микрофон запретили — ошибка с понятным текстом. */
    async resume() {
      if (closed || segment) return
      await closing
      const next = await openSegment(mime, onSegmentLevel)
      if (closed) next.cancel()
      else segment = next
    },
    /** Записанное на сейчас — прослушать и обрезать на паузе. */
    snapshot: current,
    seconds,
    cancel() {
      closed = true
      segment?.cancel()
      segment = null
    },
  }
}
