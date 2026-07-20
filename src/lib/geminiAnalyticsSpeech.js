import { ISKRA_NAME } from './admin/geminiIskraCore.js'
import {
  polishIskraReplyText,
  expandAbbreviationsForSpeech,
  prepareNumbersForSpeech,
} from './admin/iskraReplyPhrasing.js'
import { naturalizeTextForSpeech } from './admin/iskraSpeechNaturalizer.js'

const GENDER_STORAGE_KEY = 'fit_gemini_gender'
const AUTO_SPEAK_KEY = 'fit_gemini_auto_speak'

let resumeIntervalId = null
let speechGeneration = 0
let cachedVoices = null
let voicesLoadPromise = null
/** @type {HTMLAudioElement | null} */
let neuralAudioEl = null
/** @type {string | null} */
let neuralObjectUrl = null
/** Один Audio на сессию — разблокируется жестом, потом играет neural без повторного gesture. */
let unlockedAudioEl = null

const SPEECH_CHUNK_MAX = 150
const SPEECH_RESUME_MS = 200
const SPEECH_CHUNK_PAUSE_MS = 150
const SPEECH_CHUNK_PAUSE_SENTENCE_MS = 240
const SPEECH_CHUNK_PAUSE_COMMA_MS = 170

/** @param {SpeechVoiceLike} voice */
function isRussianVoice(voice) {
  const name = String(voice?.name ?? '')
  const lang = String(voice?.lang ?? '')
  return (
    /^ru(-|$)/i.test(lang) ||
    /рус|irina|pavel|svetlana|dmitri|dmitry|svetlananeural|dmitrineural/i.test(name)
  )
}

/** @param {SpeechVoiceLike} voice */
function isMicrosoftVoice(voice) {
  return /microsoft/i.test(String(voice?.name ?? ''))
}

/** @param {SpeechVoiceLike} voice */
function isGoogleVoice(voice) {
  return /google/i.test(String(voice?.name ?? ''))
}

/** @param {SpeechVoiceLike} voice */
function isMicrosoftOnlineVoice(voice) {
  const name = String(voice?.name ?? '').toLowerCase()
  return isMicrosoftVoice(voice) && (/online/i.test(name) || /neural/i.test(name))
}

/** @param {SpeechVoiceLike} voice */
function isMicrosoftDesktopVoice(voice) {
  return isMicrosoftVoice(voice) && /desktop/i.test(String(voice?.name ?? '').toLowerCase())
}

/** @param {SpeechVoiceLike[]} voices */
function sortMicrosoftVoices(voices) {
  return [...voices].sort((a, b) => {
    const score = (v) => {
      const name = String(v?.name ?? '')
      let s = 0
      // Desktop стабильнее Online (без VPN Online часто «молчит» → системный EN).
      if (isMicrosoftDesktopVoice(v)) s += 50
      if (isMicrosoftOnlineVoice(v)) s += 20
      if (/natural/i.test(name)) s += 12
      if (/neural/i.test(name)) s += 10
      return s
    }
    return score(b) - score(a)
  })
}

/** @param {'male'|'female'|string} gender */
function normalizeGender(gender) {
  return gender === 'male' ? 'male' : 'female'
}

export function loadGeminiGender() {
  try {
    const v = localStorage.getItem(GENDER_STORAGE_KEY)
    if (v === 'male') return 'male'
    if (v === 'female') return 'female'
    return 'female'
  } catch {
    return 'female'
  }
}

export function saveGeminiGender(gender) {
  try {
    localStorage.setItem(GENDER_STORAGE_KEY, gender === 'female' ? 'female' : 'male')
  } catch {
    /* ignore */
  }
}

export function loadGeminiAutoSpeak() {
  try {
    const v = localStorage.getItem(AUTO_SPEAK_KEY)
    return v !== '0'
  } catch {
    return true
  }
}

export function saveGeminiAutoSpeak(enabled) {
  try {
    localStorage.setItem(AUTO_SPEAK_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/**
 * Разблокирует TTS в цепочке жеста пользователя (перед speak / микрофоном).
 * Не вызывает cancel — иначе Chrome обрывает следующую фразу на первом слове.
 */
export function primeGeminiSpeechPlayback() {
  if (typeof window === 'undefined') return false
  let ok = false
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.resume()
      ok = true
    } catch {
      /* ignore */
    }
  }
  try {
    if (!unlockedAudioEl) unlockedAudioEl = new Audio()
    unlockedAudioEl.volume = 1
    unlockedAudioEl.src =
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
    const p = unlockedAudioEl.play()
    if (p && typeof p.then === 'function') {
      void p
        .then(() => {
          try {
            unlockedAudioEl.pause()
            unlockedAudioEl.currentTime = 0
          } catch {
            /* ignore */
          }
        })
        .catch(() => {})
    }
    ok = true
  } catch {
    /* ignore */
  }
  return ok
}

/**
 * Делит длинный ответ на фразы — Chrome иначе замирает после «ИСКРА».
 * @param {string} text
 * @param {number} [maxLen]
 */
/** @param {string} chunk */
export function speechChunkPauseMs(chunk) {
  const tail = String(chunk ?? '').trim()
  if (/[.!?]$/.test(tail)) return SPEECH_CHUNK_PAUSE_SENTENCE_MS
  if (/[,;:]$/.test(tail)) return SPEECH_CHUNK_PAUSE_COMMA_MS
  return SPEECH_CHUNK_PAUSE_MS
}

function hardSplitSpeechSegment(segment, maxLen) {
  const parts = []
  let rest = String(segment ?? '').trim()
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('. ', maxLen)
    if (cut < 40) cut = rest.lastIndexOf(', ', maxLen)
    if (cut < 25) cut = rest.lastIndexOf(' ', maxLen)
    if (cut < 12) cut = maxLen
    parts.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

export function splitSpeechChunks(text, maxLen = SPEECH_CHUNK_MAX) {
  const clean = String(text ?? '').trim()
  if (!clean) return []
  if (clean.length <= maxLen) return [clean]

  const sentences = []
  let buffer = ''
  for (const ch of clean) {
    buffer += ch
    if (/[.!?]/.test(ch) && buffer.trim()) {
      sentences.push(buffer.trim())
      buffer = ''
    }
  }
  if (buffer.trim()) sentences.push(buffer.trim())

  const source = sentences.length ? sentences : [clean]
  const merged = []
  let group = ''

  for (const sentence of source) {
    const piece = sentence.trim()
    if (!piece) continue
    const candidate = group ? `${group} ${piece}` : piece
    if (candidate.length <= maxLen) {
      group = candidate
      continue
    }
    if (group) merged.push(group)
    if (piece.length <= maxLen) {
      group = piece
      continue
    }
    const hard = hardSplitSpeechSegment(piece, maxLen)
    if (hard.length === 1) {
      group = hard[0]
      continue
    }
    merged.push(...hard.slice(0, -1))
    group = hard[hard.length - 1] ?? ''
  }

  if (group) merged.push(group)
  return merged.filter(Boolean)
}

function getVoicesCached() {
  if (cachedVoices?.length) {
    // Подтянуть Microsoft, если Chrome догрузил голоса после первого кэша.
    try {
      const live = typeof window !== 'undefined' ? window.speechSynthesis?.getVoices?.() ?? [] : []
      if (live.length) {
        const cachedHasMs = cachedVoices.some((v) => isMicrosoftVoice(v) && isRussianVoice(v))
        const liveHasMs = live.some((v) => isMicrosoftVoice(v) && isRussianVoice(v))
        if (live.length > cachedVoices.length || (liveHasMs && !cachedHasMs)) {
          cachedVoices = [...live]
        }
      }
    } catch {
      /* ignore */
    }
    return Promise.resolve(cachedVoices)
  }
  if (!voicesLoadPromise) {
    voicesLoadPromise = waitForVoices().then((voices) => {
      cachedVoices = voices
      return voices
    })
  }
  return voicesLoadPromise
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve([])
  }

  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    let settled = false
    let best = []
    const startedAt = Date.now()

    const collect = () => {
      const voices = synth.getVoices()
      if (voices.length >= best.length) best = [...voices]
      return best
    }

    const hasMicrosoftRu = () =>
      best.some((v) => isMicrosoftVoice(v) && isRussianVoice(v))

    const cleanup = () => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', onChange)
      }
      synth.onvoiceschanged = null
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(collect())
    }

    const tryFinish = () => {
      collect()
      const elapsed = Date.now() - startedAt
      if (hasMicrosoftRu() && elapsed >= 250) {
        finish()
        return
      }
      if (elapsed >= 2200) finish()
    }

    const onChange = () => tryFinish()

    collect()
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', onChange)
    }
    synth.onvoiceschanged = onChange

    ;[200, 500, 900, 1400, 2200].forEach((ms) => setTimeout(tryFinish, ms))
  })
}

/** Текст для TTS: разговорная форма без символов, которые читаются коряво. */
export function prepareTextForSpeech(text) {
  let s = prepareNumbersForSpeech(
    polishIskraReplyText(text)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/([А-ЯЁ]{2,4})\/([А-ЯЁ]{2,4})(?:\/([А-ЯЁ]{2,4}))?/g, (_, a, b, c) =>
        c ? `${a}, ${b}, ${c}` : `${a}, ${b}`)
      .replace(/~\s*/g, 'около '),
  )
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/:\s+/g, ', ')
    .replace(/;\s*/g, ', ')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/[*_`#~|\\]+/g, ' ')
    .replace(/[«»"“”()[\]{}]/g, ' ')
    .replace(/^\s*[-•·▪►]+\s*/gm, '')
    .replace(/\s+[-•·▪►]\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

  return naturalizeTextForSpeech(expandAbbreviationsForSpeech(s))
}

/** @typedef {{ name?: string, lang?: string, voiceURI?: string }} SpeechVoiceLike */
/** @typedef {'primary' | 'local_ms' | 'google'} SpeechVoiceTier */

/**
 * @param {SpeechVoiceLike} voice
 * @param {'male'|'female'} gender
 */
function scoreSpeechVoice(voice, gender) {
  const name = String(voice?.name ?? '')
  const lower = name.toLowerCase()

  if (!isRussianVoice(voice)) return -1000

  let score = 0

  // Desktop ru надёжнее Online Natural (без VPN Online даёт системный EN + Google).
  if (isMicrosoftVoice(voice)) score += 40
  if (isMicrosoftDesktopVoice(voice)) score += 45
  if (isMicrosoftOnlineVoice(voice)) score -= 200
  if (/natural/i.test(name) && !isMicrosoftOnlineVoice(voice)) score += 10
  if (/neural/i.test(name) && !isMicrosoftOnlineVoice(voice)) score += 14
  if (isGoogleVoice(voice)) score -= 120

  if (gender === 'female') {
    if (/irina/i.test(lower)) score += 60
    if (/svetlana/i.test(lower)) score += 40
    if (/dmitri|dmitry|pavel|yuri|male|муж/i.test(lower)) score -= 80
    if (/female|жен|milena|katya|anna|elena|olga/i.test(lower)) score += 12
  } else {
    if (/dmitri|dmitry/i.test(lower)) score += 55
    if (/pavel/i.test(lower)) score += 50
    if (/yuri/i.test(lower)) score += 20
    if (/svetlana|irina|milena|katya|anna|female|жен|elena|olga/i.test(lower)) score -= 80
    if (/male|муж/i.test(lower)) score += 12
  }

  return score
}

export function pickGeminiSpeechVoice(gender, voices) {
  const normalized = normalizeGender(gender)
  const list = Array.isArray(voices) ? voices : []
  // Никогда не падаем на английский системный голос.
  const pool = list.filter((v) => isRussianVoice(v))
  if (!pool.length) return null

  // Online Natural в Chrome часто «молчит» и подменяет Google — не выбираем в браузере.
  const stable = pool.filter((v) => !isMicrosoftOnlineVoice(v))
  const hasLocalMs = stable.some((v) => isMicrosoftVoice(v))
  const candidates = hasLocalMs
    ? stable.filter((v) => !isGoogleVoice(v))
    : stable.filter((v) => isGoogleVoice(v)).length
      ? stable.filter((v) => isGoogleVoice(v))
      : stable

  let best = null
  let bestScore = -Infinity

  for (const voice of candidates) {
    const score = scoreSpeechVoice(voice, normalized)
    if (score > bestScore) {
      bestScore = score
      best = voice
    }
  }

  if (best && bestScore > -500) return best

  if (hasLocalMs) {
    const microsoftOnly = stable.filter((v) => isMicrosoftVoice(v))
    return sortMicrosoftVoices(microsoftOnly)[0] ?? null
  }

  return pickGeminiSpeechFallbackVoice(normalized, pool)
}

/** Запасной голос Google ru — только если Microsoft совсем недоступен. */
export function pickGeminiSpeechFallbackVoice(gender, voices) {
  const normalized = normalizeGender(gender)
  const list = Array.isArray(voices) ? voices : []
  const googleRu = list.filter((v) => isGoogleVoice(v) && isRussianVoice(v))
  if (!googleRu.length) return null

  let best = null
  let bestScore = -Infinity

  for (const voice of googleRu) {
    const lower = String(voice?.name ?? '').toLowerCase()
    let score = 50
    if (normalized === 'female' && !/male|муж/i.test(lower)) score += 28
    else if (normalized === 'male' && /male|муж/i.test(lower)) score += 12
    if (score > bestScore) {
      bestScore = score
      best = voice
    }
  }

  return best
}

/**
 * Локальный / не-Online Microsoft — красивее Google, обычно без VPN.
 * Neural без Online оставляем здесь как ступень после Online Natural.
 * @param {'male'|'female'|string} gender
 * @param {SpeechVoiceLike[]} voices
 */
export function pickGeminiSpeechLocalMicrosoftVoice(gender, voices) {
  const list = Array.isArray(voices) ? voices : []
  const local = list.filter((v) => {
    if (!isMicrosoftVoice(v) || !isRussianVoice(v)) return false
    if (isMicrosoftOnlineVoice(v)) return false
    return true
  })
  if (!local.length) return null
  return pickGeminiSpeechVoice(gender, local)
}

function getLiveVoices(fallback = []) {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const live = window.speechSynthesis.getVoices()
      if (live?.length) {
        cachedVoices = [...live]
        return cachedVoices
      }
    }
  } catch {
    /* ignore */
  }
  return Array.isArray(fallback) && fallback.length ? fallback : cachedVoices ?? []
}

/**
 * Живой объект голоса из текущего getVoices() — иначе Chrome игнорит voice и орёт EN.
 * @param {SpeechVoiceLike | null | undefined} picked
 * @param {SpeechVoiceLike[]} voices
 */
export function resolveLiveRussianVoice(picked, voices) {
  if (!picked) return null
  const list = Array.isArray(voices) ? voices : []
  const name = String(picked.name ?? '')
  const uri = String(picked.voiceURI ?? '')

  const byUri = uri ? list.find((v) => v.voiceURI === uri) : null
  if (byUri && isRussianVoice(byUri) && !/^en(-|$)/i.test(String(byUri.lang ?? ''))) return byUri

  const byName = name
    ? list.find((v) => String(v.name ?? '') === name && isRussianVoice(v))
    : null
  if (byName) return byName

  if (isRussianVoice(picked) && list.includes(picked)) return picked
  return null
}

/**
 * @param {'male'|'female'|string} gender
 * @param {SpeechVoiceLike[]} voices
 * @param {SpeechVoiceTier} tier
 */
export function pickVoiceForSpeechTier(gender, voices, tier) {
  if (tier === 'google') return pickGeminiSpeechFallbackVoice(gender, voices)
  if (tier === 'local_ms') {
    return (
      pickGeminiSpeechLocalMicrosoftVoice(gender, voices) ??
      pickGeminiSpeechVoice(gender, voices)
    )
  }
  return pickGeminiSpeechVoice(gender, voices)
}

/**
 * @param {SpeechSynthesisUtterance} utter
 * @param {'male'|'female'|string} gender
 * @param {SpeechVoiceLike[]} voices
 * @param {{ voiceTier?: SpeechVoiceTier, useFallback?: boolean }} [options]
 * @returns {boolean}
 */
function bindVoice(utter, gender, voices, options = {}) {
  const tier =
    options.voiceTier ??
    (options.useFallback ? 'google' : 'primary')
  const live = getLiveVoices(voices)
  const picked = pickVoiceForSpeechTier(gender, live, tier)
  const voice = resolveLiveRussianVoice(picked, live)
  if (!voice) return false
  utter.voice = voice
  utter.lang = 'ru-RU'
  return true
}

function clearResumeInterval() {
  if (resumeIntervalId != null) {
    clearInterval(resumeIntervalId)
    resumeIntervalId = null
  }
}

function armChromeSpeechResume() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  clearResumeInterval()
  resumeIntervalId = window.setInterval(() => {
    const synth = window.speechSynthesis
    if (!synth.speaking && !synth.pending) {
      clearResumeInterval()
      return
    }
    try {
      synth.resume()
    } catch {
      /* ignore */
    }
  }, SPEECH_RESUME_MS)
}

/** Почти мгновенный onend у Online = «молчит», не живая фраза Desktop. */
const SPEECH_DEAD_END_MS = 320
const SPEECH_DEAD_END_MIN_CHARS = 20

/**
 * @returns {SpeechSynthesisUtterance | null}
 */
function buildUtterance(chunk, gender, voices, options = {}) {
  const normalized = normalizeGender(gender)
  const utter = new SpeechSynthesisUtterance(chunk)
  utter.lang = 'ru-RU'
  utter.rate = normalized === 'female' ? 0.92 : 0.95
  utter.pitch = normalized === 'female' ? 1.02 : 0.88
  utter.volume = 1
  if (!bindVoice(utter, normalized, voices, options)) return null
  if (!utter.voice || !isRussianVoice(utter.voice)) return null
  return utter
}

/**
 * Эскалация только с Online (не с Desktop) — иначе уходим в скрипучий Google.
 */
export function shouldEscalateSpeechVoice(utter, chunk, elapsedMs, tier) {
  if (tier !== 'primary') return false
  if (!utter?.voice) return true
  if (!isMicrosoftOnlineVoice(utter.voice)) return false
  const text = String(chunk ?? '')
  if (text.length < SPEECH_DEAD_END_MIN_CHARS) return false
  return elapsedMs < SPEECH_DEAD_END_MS
}

/**
 * Online → Desktop. На Google — только если русского Microsoft нет совсем.
 * @param {SpeechVoiceTier} tier
 * @param {'male'|'female'|string} gender
 * @param {SpeechVoiceLike[]} voices
 * @returns {SpeechVoiceTier | null}
 */
export function nextSpeechVoiceTier(tier, gender, voices) {
  const hasLocalMs = !!pickGeminiSpeechLocalMicrosoftVoice(gender, voices)
  const hasAnyMs = (Array.isArray(voices) ? voices : []).some(
    (v) => isMicrosoftVoice(v) && isRussianVoice(v),
  )
  if (tier === 'primary') {
    if (hasLocalMs) return 'local_ms'
    if (!hasAnyMs && pickGeminiSpeechFallbackVoice(gender, voices)) return 'google'
    return null
  }
  if (tier === 'local_ms') {
    // Не прыгаем на Google, если Desktop уже есть — лучше тишина, чем скрип.
    return null
  }
  return null
}

function stopNeuralAudioPlayback() {
  if (neuralAudioEl) {
    try {
      neuralAudioEl.pause()
      neuralAudioEl.removeAttribute('src')
      neuralAudioEl.load()
    } catch {
      /* ignore */
    }
    neuralAudioEl = null
  }
  if (neuralObjectUrl) {
    try {
      URL.revokeObjectURL(neuralObjectUrl)
    } catch {
      /* ignore */
    }
    neuralObjectUrl = null
  }
}

/**
 * Красивый neural (Svetlana) с сервера — когда в Chrome нет Microsoft Desktop.
 * @param {string} text
 * @param {'male'|'female'|string} gender
 * @param {number} generation
 */
async function speakWithNeuralTts(text, gender, generation) {
  const { fetchIskraNeuralTts } = await import('./admin/iskraTtsService.js')
  const result = await fetchIskraNeuralTts(text, gender)
  if (generation !== speechGeneration) return false
  if (!result.ok) return false

  stopNeuralAudioPlayback()
  const binary = atob(result.base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: result.mime || 'audio/mpeg' })
  neuralObjectUrl = URL.createObjectURL(blob)

  const audio = unlockedAudioEl || new Audio()
  unlockedAudioEl = audio
  neuralAudioEl = audio
  audio.src = neuralObjectUrl
  audio.volume = 1

  await new Promise((resolve, reject) => {
    audio.onended = () => resolve(true)
    audio.onerror = () => reject(new Error('audio_error'))
    const p = audio.play()
    if (p && typeof p.then === 'function') {
      p.catch(reject)
    }
  })
  return generation === speechGeneration
}

export async function speakGeminiText(text, gender = 'female') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false

  const clean = prepareTextForSpeech(text)
  if (!clean) return false

  const generation = ++speechGeneration
  stopNeuralAudioPlayback()

  let voices = await getVoicesCached()
  voices = getLiveVoices(voices)
  if (generation !== speechGeneration) return false

  const localMs = pickGeminiSpeechLocalMicrosoftVoice(gender, voices)
  const canUseLocal =
    !!localMs && !!resolveLiveRussianVoice(localMs, getLiveVoices(voices))

  // В Chrome обычно только Google — берём neural Svetlana с API, не скрипучий Google.
  if (!canUseLocal) {
    try {
      const ok = await speakWithNeuralTts(clean, gender, generation)
      if (ok) return true
    } catch {
      /* fall through to browser Google */
    }
    if (generation !== speechGeneration) return false
  }

  const chunks = splitSpeechChunks(clean)
  if (!chunks.length) return false

  if (!pickGeminiSpeechVoice(gender, voices) && !pickGeminiSpeechFallbackVoice(gender, voices)) {
    return false
  }

  const synth = window.speechSynthesis
  synth.cancel()
  await delayMs(80)
  if (generation !== speechGeneration) return false

  primeGeminiSpeechPlayback()

  let index = 0
  /** @type {SpeechVoiceTier} */
  let voiceTier = canUseLocal ? 'local_ms' : 'google'

  const escalateVoiceTier = () => {
    const next = nextSpeechVoiceTier(voiceTier, gender, voices)
    if (!next) return false
    voiceTier = next
    return true
  }

  const speakNext = () => {
    if (generation !== speechGeneration) return
    if (index >= chunks.length) {
      clearResumeInterval()
      return
    }

    const chunkIndex = index
    const chunk = chunks[chunkIndex]
    index += 1

    voices = getLiveVoices(voices)
    const utter = buildUtterance(chunk, gender, voices, { voiceTier })
    const startedAt = Date.now()

    const retryChunkWithNextTier = () => {
      if (!escalateVoiceTier()) return false
      index = chunkIndex
      speakNext()
      return true
    }

    if (!utter) {
      if (retryChunkWithNextTier()) return
      clearResumeInterval()
      return
    }

    utter.onstart = () => {
      if (generation !== speechGeneration) return
      armChromeSpeechResume()
    }
    utter.onend = () => {
      if (generation !== speechGeneration) return
      const elapsed = Date.now() - startedAt
      if (shouldEscalateSpeechVoice(utter, chunk, elapsed, voiceTier)) {
        if (retryChunkWithNextTier()) return
      }
      void delayMs(speechChunkPauseMs(chunk)).then(() => {
        if (generation !== speechGeneration) return
        speakNext()
      })
    }
    utter.onerror = () => {
      if (generation !== speechGeneration) return
      if (retryChunkWithNextTier()) return
      speakNext()
    }

    try {
      synth.speak(utter)
    } catch {
      if (retryChunkWithNextTier()) return
      speakNext()
    }
  }

  speakNext()
  return true
}

export function previewGeminiVoice(_gender = 'female') {
  primeGeminiSpeechPlayback()
  void speakGeminiText(`${ISKRA_NAME} на связи. ЭВМ готова к работе`, _gender)
}

export function stopGeminiSpeech() {
  if (typeof window === 'undefined') return
  speechGeneration++
  clearResumeInterval()
  stopNeuralAudioPlayback()
  if (!window.speechSynthesis) return
  const synth = window.speechSynthesis
  try {
    synth.pause()
  } catch {
    /* ignore */
  }
  synth.cancel()
  try {
    synth.resume()
    synth.cancel()
  } catch {
    /* ignore */
  }
}

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported() {
  return !!getSpeechRecognitionCtor()
}

/**
 * @param {{
 *   onInterim?: (text: string) => void,
 *   onFinal: (text: string) => void,
 *   onError?: (message: string) => void,
 *   onEnd?: () => void,
 * }} handlers
 * @returns {{ stop: () => void } | null}
 */
export function startGeminiSpeechRecognition(handlers) {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) return null

  const recognition = new Ctor()
  recognition.lang = 'ru-RU'
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.continuous = false

  recognition.onresult = (event) => {
    let interim = ''
    let finalText = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = String(event.results[i]?.[0]?.transcript ?? '').trim()
      if (!chunk) continue
      if (event.results[i].isFinal) finalText += `${finalText ? ' ' : ''}${chunk}`
      else interim = chunk
    }
    if (interim) handlers.onInterim?.(interim)
    if (finalText) handlers.onFinal(finalText)
  }

  recognition.onerror = (event) => {
    const code = String(event?.error ?? '')
    if (code === 'aborted' || code === 'no-speech') {
      handlers.onEnd?.()
      return
    }
    const msg =
      code === 'not-allowed' || code === 'service-not-allowed'
        ? 'Разрешите микрофон в браузере (значок замка в адресной строке)'
        : code === 'audio-capture'
          ? 'Микрофон не найден или занят другим приложением'
          : code === 'network'
            ? 'Распознавание речи недоступно без сети'
            : 'Не удалось распознать речь'
    handlers.onError?.(msg)
  }

  recognition.onend = () => {
    handlers.onEnd?.()
  }

  try {
    stopGeminiSpeech()
    recognition.start()
  } catch {
    handlers.onError?.('Микрофон уже используется')
    return null
  }

  return {
    stop: () => {
      try {
        recognition.stop()
      } catch {
        /* ignore */
      }
    },
  }
}
