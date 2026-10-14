/**
 * Запись видеокружка: фронтальная камера + микрофон → MediaRecorder (MP4, если телефон умеет, иначе WebM).
 * Без перекодирования: файл уходит как записан. Отмена и остановка гасят камеру сразу.
 */
import {
  CHAT_VIDEO_AUDIO_BPS,
  CHAT_VIDEO_BAD_RU,
  CHAT_VIDEO_DENIED_RU,
  CHAT_VIDEO_NO_CAMERA_RU,
  CHAT_VIDEO_SIDE,
  CHAT_VIDEO_UNSUPPORTED_RU,
  CHAT_VIDEO_VIDEO_BPS,
  baseVideoMime,
  pickVideoRecorderMime,
} from './chatVideoCore.js'

const isTypeSupported = (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)

/** Телефон умеет снимать кружок: камера и запись видео. */
export function isChatVideoSupported() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return false
  return Boolean(navigator.mediaDevices?.getUserMedia) && pickVideoRecorderMime(isTypeSupported) !== null
}

function cameraErrorRu(e) {
  const name = String(e?.name ?? '')
  if (name === 'NotAllowedError' || name === 'SecurityError') return CHAT_VIDEO_DENIED_RU
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return CHAT_VIDEO_NO_CAMERA_RU
  return CHAT_VIDEO_BAD_RU
}

/**
 * Включить камеру и начать запись. Вызывать из обработчика нажатия.
 * @returns {Promise<{ stream: MediaStream, seconds: () => number, stop: () => Promise<{ blob: Blob, seconds: number }>, cancel: () => void }>}
 */
export async function startChatVideo() {
  const mime = pickVideoRecorderMime(isTypeSupported)
  if (!mime) throw new Error(CHAT_VIDEO_UNSUPPORTED_RU)
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: CHAT_VIDEO_SIDE }, height: { ideal: CHAT_VIDEO_SIDE }, aspectRatio: { ideal: 1 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    })
  } catch (e) {
    throw new Error(cameraErrorRu(e))
  }
  const off = () => stream.getTracks().forEach((t) => t.stop())
  const parts = []
  let recorder
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: CHAT_VIDEO_VIDEO_BPS, audioBitsPerSecond: CHAT_VIDEO_AUDIO_BPS })
    recorder.ondataavailable = (ev) => ev.data?.size && parts.push(ev.data)
    recorder.start(1000)
  } catch {
    off()
    throw new Error(CHAT_VIDEO_UNSUPPORTED_RU)
  }
  const startedAt = performance.now()
  const seconds = () => (performance.now() - startedAt) / 1000

  return {
    stream,
    seconds,
    stop() {
      const sec = seconds()
      return new Promise((resolve, reject) => {
        recorder.onstop = () => {
          off()
          const type = baseVideoMime(recorder.mimeType) ?? baseVideoMime(mime) ?? 'video/webm'
          const blob = new Blob(parts, { type })
          if (blob.size) resolve({ blob, seconds: sec })
          else reject(new Error(CHAT_VIDEO_BAD_RU))
        }
        recorder.onerror = () => {
          off()
          reject(new Error(CHAT_VIDEO_BAD_RU))
        }
        if (recorder.state === 'inactive') recorder.onstop()
        else recorder.stop()
      })
    },
    cancel() {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      off()
    },
  }
}
