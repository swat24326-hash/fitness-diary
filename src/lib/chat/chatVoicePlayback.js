/**
 * Один плеер голосовых на всё приложение, как в Telegram: играет дальше, даже если ушли из диалога (мини-плеер),
 * доиграло — следующее голосовое собеседника, пауза помнит место, скорость — на все голосовые, кнопки на экране
 * блокировки (Media Session). Один <audio> на всё: iPhone разрешает звук элементу, который уже включали касанием, —
 * так следующее голосовое включается само. Правила — chatVoicePlaylistCore.js.
 */
import { CHAT_VOICE_LOAD_FAILED_RU, nextVoiceSpeed } from './chatVoiceCore.js'
import { isPastVoiceRange, nextVoiceInQueue, parseVoiceSpeed, prevVoiceInQueue, voiceResumeAt } from './chatVoicePlaylistCore.js'

/**
 * @typedef {{ key: string, sec: number, load: () => Promise<{ audio: string, mime?: string } | { blob: Blob }>, title?: string,
 *   mine?: boolean, expired?: boolean, preview?: boolean, range?: [number, number], once?: boolean }} VoiceTrack
 * preview — своя запись перед отправкой: без мини-плеера и очереди; range — обрезка (доли 0…1);
 * once — одноразовое: без перемотки и памяти места, доиграло / закрыли / включили другое — звук стёрт (consumed)
 */

/** Кадр тишины MP3: iPhone пускает звук только по касанию, а голосовое ещё грузится — «разогреваем» плеер сразу. */
const SILENT_MP3 =
  'data:audio/mpeg;base64,//NIxAAAAANIAAAAAExBTUUDAAkIAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const CACHE_MAX = 20
const SPEED_KEY = 'fd-chat-voice-speed'

/** Звук по ключу, пока страница открыта: второй раз не качаем. */
const cache = new Map()
/** Где остановились. */
const positions = new Map()
const listeners = new Set()
/** @type {VoiceTrack[]} */
let queue = []
let audio = null
let token = 0
let state = { track: null, status: 'idle', progress: 0, error: null, speed: readSpeed(), played: new Set(), consumed: new Set(), inlineHosts: 0 }

function readSpeed() {
  try {
    return parseVoiceSpeed(globalThis.localStorage?.getItem(SPEED_KEY))
  } catch {
    return 1
  }
}

function emit(patch) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

function remember(key, url) {
  cache.set(key, url)
  if (cache.size <= CACHE_MAX) return
  const [oldKey, oldUrl] = cache.entries().next().value
  cache.delete(oldKey)
  URL.revokeObjectURL(oldUrl)
}

function objectUrl(base64, mime) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/mpeg' }))
}

const isReady = () => Boolean(audio?.dataset.ready)
const duration = () => (audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : state.track?.sec || 1)

/** Одноразовое прослушали: звук из памяти вон — второй раз не включить даже без перезагрузки. */
function consume(track) {
  if (!track?.once) return
  const url = cache.get(track.key)
  if (url) URL.revokeObjectURL(url)
  cache.delete(track.key)
  positions.delete(track.key)
  emit({ consumed: new Set(state.consumed).add(track.key) })
}

function savePosition() {
  const t = state.track
  if (!t || t.preview || t.once || !isReady()) return
  const r = voiceResumeAt(audio.currentTime / duration())
  if (r) positions.set(t.key, r)
  else positions.delete(t.key)
}

function mediaSession() {
  return typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
}

function setMediaPosition() {
  const ms = mediaSession()
  if (!ms?.setPositionState || state.track?.preview) return
  try {
    const d = duration()
    ms.setPositionState({ duration: d, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, d) })
  } catch {
    /* старый браузер */
  }
}

let mediaArmed = false
function setMediaTrack(track) {
  const ms = mediaSession()
  if (!ms || track.preview) return
  try {
    ms.metadata = new window.MediaMetadata({
      title: track.title || 'Голосовое',
      artist: 'Голосовое сообщение',
      artwork: [{ src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png' }],
    })
  } catch {
    /* без MediaMetadata — просто без подписи */
  }
  if (mediaArmed) return
  mediaArmed = true
  const on = (action, fn) => {
    try {
      ms.setActionHandler(action, fn)
    } catch {
      /* действие не поддерживается */
    }
  }
  on('play', () => void audio?.play().catch(() => {}))
  on('pause', () => audio?.pause())
  on('stop', () => closeVoice())
  on('nexttrack', () => skipVoice(1))
  on('previoustrack', () => skipVoice(-1))
  on('seekto', (d) => {
    if (isReady() && !state.track?.once && Number.isFinite(d?.seekTime)) audio.currentTime = d.seekTime
  })
}

function audioEl() {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  const real = (fn) => () => isReady() && fn()
  audio.ontimeupdate = real(() => {
    const d = duration()
    const range = state.track?.range
    if (isPastVoiceRange(audio.currentTime, d, range)) {
      audio.pause()
      audio.currentTime = range[0] * d
      emit({ status: 'paused', progress: range[0] })
      return
    }
    emit({ progress: Math.min(1, audio.currentTime / d) })
    setMediaPosition()
  })
  audio.onplay = real(() => {
    emit({ status: 'playing' })
    const ms = mediaSession()
    if (ms && !state.track?.preview) ms.playbackState = 'playing'
  })
  audio.onpause = real(() => {
    if (audio.ended) return
    savePosition()
    emit({ status: 'paused' })
    const ms = mediaSession()
    if (ms && !state.track?.preview) ms.playbackState = 'paused'
  })
  audio.onended = real(() => {
    const done = state.track
    if (!done) return
    positions.delete(done.key)
    consume(done)
    const next = done.preview ? null : nextVoiceInQueue(queue, done.key)
    if (next) void startVoice(next)
    else if (done.preview) emit({ status: 'idle', progress: done.range?.[0] ?? 0 })
    else closeVoice()
  })
  return audio
}

/** @param {VoiceTrack} track @param {number} [at] с какого места (доля) */
async function startVoice(track, at) {
  const a = audioEl()
  const my = ++token
  if (state.track && state.track.key !== track.key) {
    savePosition()
    consume(state.track)
  }
  a.pause()
  delete a.dataset.ready
  let url = cache.get(track.key)
  emit({ track, status: 'loading', progress: at ?? positions.get(track.key) ?? 0, error: null })
  if (!url) {
    a.src = SILENT_MP3
    void a.play().catch(() => {})
    try {
      const loaded = await track.load()
      if (my !== token) return
      url = loaded.blob ? URL.createObjectURL(loaded.blob) : objectUrl(loaded.audio, loaded.mime)
      remember(track.key, url)
    } catch (e) {
      if (my !== token) return
      a.pause()
      emit({ track: null, status: 'idle', progress: 0, error: { key: track.key, message: e?.message || CHAT_VOICE_LOAD_FAILED_RU } })
      return
    }
    if (!track.preview) emit({ played: new Set(state.played).add(track.key) })
  }
  a.pause()
  a.src = url
  a.dataset.ready = '1'
  a.defaultPlaybackRate = state.speed
  a.playbackRate = state.speed
  const from = at ?? (track.range ? track.range[0] : voiceResumeAt(positions.get(track.key)))
  if (from > 0) {
    const seek = () => {
      a.currentTime = from * duration()
    }
    if (a.readyState >= 1) seek()
    else a.addEventListener('loadedmetadata', seek, { once: true })
  }
  setMediaTrack(track)
  try {
    await a.play()
  } catch {
    if (my === token) emit({ status: 'paused' })
  }
}

/** ▶ / ⏸ в пузыре, мини-плеере или у своей записи. @param {VoiceTrack} track */
export function toggleVoice(track) {
  if (track.once && state.consumed.has(track.key)) return undefined
  if (state.track?.key !== track.key) return startVoice(track)
  if (state.status === 'loading') return undefined
  if (state.status === 'playing') {
    audio.pause()
    return undefined
  }
  if (!isReady()) return startVoice(track)
  return audio.play().catch(() => emit({ status: 'paused' }))
}

/**
 * Перемотка по волне (нажатие или перетаскивание). Это голосовое не играло — включаем с этого места.
 * resume=false — палец ещё тянет: только двигаем.
 */
export function seekVoice(track, ratio, { resume = true } = {}) {
  if (track.once) return
  if (state.track?.key === track.key && isReady()) {
    audio.currentTime = ratio * duration()
    emit({ progress: ratio })
    if (resume && audio.paused) void audio.play().catch(() => {})
    return
  }
  if (resume) void startVoice(track, ratio)
}

export function pauseVoice() {
  if (state.status === 'playing') audio?.pause()
}

export function closeVoice() {
  token += 1
  savePosition()
  consume(state.track)
  if (audio) {
    audio.pause()
    delete audio.dataset.ready
  }
  emit({ track: null, status: 'idle', progress: 0 })
  const ms = mediaSession()
  if (ms) {
    ms.playbackState = 'none'
    ms.metadata = null
  }
}

/** Мини-плеер / экран блокировки: следующее (1) или предыдущее (-1) голосовое диалога. */
export function skipVoice(dir) {
  const key = state.track?.key
  if (!key) return
  const to = dir > 0 ? nextVoiceInQueue(queue, key) : prevVoiceInQueue(queue, key)
  if (to) void startVoice(to)
}

export function cycleVoiceSpeed() {
  const speed = nextVoiceSpeed(state.speed)
  try {
    globalThis.localStorage?.setItem(SPEED_KEY, String(speed))
  } catch {
    /* приватный режим — скорость только до перезагрузки */
  }
  if (audio) {
    audio.defaultPlaybackRate = speed
    audio.playbackRate = speed
  }
  emit({ speed })
}

/** Голосовые открытого диалога по порядку ленты — для «подряд» и кнопок next / prev. */
export function setVoiceQueue(tracks) {
  queue = tracks
}

/** Обрезка своей записи поменялась, пока она играет. */
export function updateVoiceTrack(key, patch) {
  if (state.track?.key === key) emit({ track: { ...state.track, ...patch } })
}

/** Своя запись удалена / отправлена: остановить и освободить звук. */
export function forgetVoice(key) {
  if (state.track?.key === key) closeVoice()
  const url = cache.get(key)
  if (url) URL.revokeObjectURL(url)
  cache.delete(key)
  positions.delete(key)
}

/** Мини-плеер внутри диалога есть — плавающий не нужен. @returns {() => void} */
export function registerVoiceInlineHost() {
  emit({ inlineHosts: state.inlineHosts + 1 })
  return () => emit({ inlineHosts: state.inlineHosts - 1 })
}

export function subscribeVoice(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getVoiceState() {
  return state
}

/** Состояние одного пузыря: играет он — живое; нет — остановка на запомненном месте. */
export function voiceSliceOf(key) {
  const current = state.track?.key === key
  return {
    status: current ? state.status : 'idle',
    progress: current ? state.progress : (positions.get(key) ?? 0),
    error: state.error?.key === key ? state.error.message : '',
    speed: state.speed,
    played: state.played.has(key),
    consumed: state.consumed.has(key),
  }
}
