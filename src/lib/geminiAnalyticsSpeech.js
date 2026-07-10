import { ISKRA_NAME } from './admin/geminiIskraCore.js'
import { polishIskraReplyText, expandAbbreviationsForSpeech } from './admin/iskraReplyPhrasing.js'

const GENDER_STORAGE_KEY = 'fit_gemini_gender'
const AUTO_SPEAK_KEY = 'fit_gemini_auto_speak'

let resumeIntervalId = null
let speechGeneration = 0

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

/** @param {SpeechVoiceLike[]} voices */
function sortMicrosoftVoices(voices) {
  return [...voices].sort((a, b) => {
    const score = (v) => {
      const name = String(v?.name ?? '')
      let s = 0
      if (/online/i.test(name)) s += 30
      if (/natural/i.test(name)) s += 20
      if (/desktop/i.test(name)) s += 5
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
 * Разблокирует TTS после жеста пользователя (отправка вопроса / чип).
 * Без этого браузер часто блокирует автоозвучку ответа после async-запроса.
 */
export function primeGeminiSpeechPlayback() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  try {
    const synth = window.speechSynthesis
    synth.resume()
    if (synth.speaking) synth.cancel()
    const utter = new SpeechSynthesisUtterance('\u200b')
    utter.volume = 0.01
    utter.rate = 10
    utter.lang = 'ru-RU'
    synth.speak(utter)
    return true
  } catch {
    return false
  }
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
  let s = polishIskraReplyText(text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/([А-ЯЁ]{2,4})\/([А-ЯЁ]{2,4})(?:\/([А-ЯЁ]{2,4}))?/g, (_, a, b, c) =>
      c ? `${a}, ${b}, ${c}` : `${a}, ${b}`)
    .replace(/~\s*/g, 'около ')
    .replace(/(\d[\d\s]*)\s*₽/g, '$1 рублей')
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, '$1 процентов')
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

  return expandAbbreviationsForSpeech(s)
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

  if (/microsoft/i.test(name)) score += 35
  if (/online/i.test(name)) score += 30
  if (/natural/i.test(name)) score += 20
  if (/neural/i.test(name)) score += 25
  if (/desktop/i.test(name)) score += 8
  if (/google/i.test(name)) score -= 80

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

function bindVoice(utter, gender, voices) {
  const picked = pickGeminiSpeechVoice(gender, voices)
  if (!picked) return
  const uri = String(picked.voiceURI ?? '')
  const bound = uri ? voices.find((v) => v.voiceURI === uri) : null
  const voice = bound ?? picked
  utter.voice = voice
  if (voice?.lang) utter.lang = voice.lang
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
    if (!synth.speaking) {
      clearResumeInterval()
      return
    }
    synth.resume()
  }, 8000)
}

export async function speakGeminiText(text, gender = 'female') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false

  const clean = prepareTextForSpeech(text)
  if (!clean) return false

  const generation = ++speechGeneration
  const normalized = normalizeGender(gender)
  const voices = await waitForVoices()
  if (generation !== speechGeneration) return false

  const utter = new SpeechSynthesisUtterance(clean)
  utter.lang = 'ru-RU'
  utter.rate = normalized === 'female' ? 0.94 : 0.98
  utter.pitch = normalized === 'female' ? 1.02 : 0.82
  utter.volume = 1

  bindVoice(utter, normalized, voices)

  const synth = window.speechSynthesis
  synth.cancel()
  utter.onend = () => {
    if (generation !== speechGeneration) return
    clearResumeInterval()
  }
  utter.onerror = () => {
    if (generation !== speechGeneration) return
    clearResumeInterval()
  }
  if (generation !== speechGeneration) return false
  synth.speak(utter)
  armChromeSpeechResume()

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
      code === 'not-allowed'
        ? 'Разрешите микрофон в браузере'
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
