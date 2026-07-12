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
      if (isMicrosoftOnlineVoice(v)) s += 40
      if (/natural/i.test(name)) s += 20
      if (/neural/i.test(name)) s += 15
      if (isMicrosoftDesktopVoice(v)) s += 8
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
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  try {
    window.speechSynthesis.resume()
    return true
  } catch {
    return false
  }
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
  if (cachedVoices?.length) return Promise.resolve(cachedVoices)
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

/**
 * @param {SpeechVoiceLike} voice
 * @param {'male'|'female'} gender
 */
function scoreSpeechVoice(voice, gender) {
  const name = String(voice?.name ?? '')
  const lower = name.toLowerCase()

  if (!isRussianVoice(voice)) return -1000

  let score = 0

  // Основной голос — Microsoft Online Natural (с VPN звучит лучше всего).
  if (isMicrosoftVoice(voice)) score += 35
  if (isMicrosoftOnlineVoice(voice)) score += 30
  if (/natural/i.test(name)) score += 20
  if (/neural/i.test(name)) score += 25
  if (isMicrosoftDesktopVoice(voice)) score += 8
  if (isGoogleVoice(voice)) score -= 80

  if (gender === 'female') {
    if (/svetlana/i.test(lower)) score += 55
    if (/irina/i.test(lower)) score += 35
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
  const pool = list.filter((v) => isRussianVoice(v))
  const base = pool.length ? pool : list
  if (!base.length) return null

  const hasMicrosoft = base.some((v) => isMicrosoftVoice(v))
  const candidates = hasMicrosoft ? base.filter((v) => !isGoogleVoice(v)) : base

  let best = null
  let bestScore = -Infinity

  for (const voice of candidates) {
    const score = scoreSpeechVoice(voice, normalized)
    if (score > bestScore) {
      bestScore = score
      best = voice
    }
  }

  if (best) return best

  if (hasMicrosoft) {
    const microsoftOnly = base.filter((v) => isMicrosoftVoice(v))
    return sortMicrosoftVoices(microsoftOnly)[0] ?? null
  }

  return base[0] ?? null
}

/** Запасной голос Google ru — если Microsoft Online недоступен без VPN. */
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

function resolveBoundVoice(voice, voices) {
  if (!voice) return null
  const uri = String(voice.voiceURI ?? '')
  const bound = uri ? voices.find((v) => v.voiceURI === uri) : null
  return bound ?? voice
}

function bindVoice(utter, gender, voices, options = {}) {
  const { useFallback = false } = options
  const picked = useFallback
    ? pickGeminiSpeechFallbackVoice(gender, voices)
    : pickGeminiSpeechVoice(gender, voices)
  const voice = resolveBoundVoice(picked, voices)
  if (!voice) return
  utter.voice = voice
  if (voice.lang) utter.lang = voice.lang
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

const SPEECH_MS_FALLBACK_MIN = 500
const SPEECH_MS_FALLBACK_MIN_CHARS = 16

function buildUtterance(chunk, gender, voices, options = {}) {
  const normalized = normalizeGender(gender)
  const utter = new SpeechSynthesisUtterance(chunk)
  utter.lang = 'ru-RU'
  utter.rate = normalized === 'female' ? 0.91 : 0.95
  utter.pitch = normalized === 'female' ? 1.0 : 0.86
  utter.volume = 1
  bindVoice(utter, normalized, voices, options)
  return utter
}

function shouldFallbackFromMicrosoftUtterance(utter, chunk, elapsedMs, useFallback) {
  if (useFallback || !utter?.voice) return false
  if (!isMicrosoftVoice(utter.voice)) return false
  return chunk.length >= SPEECH_MS_FALLBACK_MIN_CHARS && elapsedMs < SPEECH_MS_FALLBACK_MIN
}

export async function speakGeminiText(text, gender = 'female') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false

  const clean = prepareTextForSpeech(text)
  if (!clean) return false

  const chunks = splitSpeechChunks(clean)
  if (!chunks.length) return false

  const generation = ++speechGeneration
  const voices = await getVoicesCached()
  if (generation !== speechGeneration) return false

  const synth = window.speechSynthesis
  synth.cancel()
  await delayMs(40)
  if (generation !== speechGeneration) return false

  primeGeminiSpeechPlayback()

  let index = 0
  let useGoogleFallback = false

  const activateGoogleFallback = () => {
    if (useGoogleFallback) return false
    if (!pickGeminiSpeechFallbackVoice(gender, voices)) return false
    useGoogleFallback = true
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

    const utter = buildUtterance(chunk, gender, voices, { useFallback: useGoogleFallback })
    const startedAt = Date.now()

    const retryChunkWithGoogle = () => {
      if (!activateGoogleFallback()) return false
      index = chunkIndex
      speakNext()
      return true
    }

    utter.onend = () => {
      if (generation !== speechGeneration) return
      const elapsed = Date.now() - startedAt
      if (
        shouldFallbackFromMicrosoftUtterance(utter, chunk, elapsed, useGoogleFallback) &&
        pickGeminiSpeechFallbackVoice(gender, voices)
      ) {
        if (retryChunkWithGoogle()) return
      }
      void delayMs(speechChunkPauseMs(chunk)).then(() => {
        if (generation !== speechGeneration) return
        speakNext()
      })
    }
    utter.onerror = () => {
      if (generation !== speechGeneration) return
      if (retryChunkWithGoogle()) return
      speakNext()
    }

    synth.speak(utter)
    armChromeSpeechResume()
    try {
      synth.resume()
    } catch {
      /* ignore */
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
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  speechGeneration++
  clearResumeInterval()
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
