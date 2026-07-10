import { ISKRA_NAME } from './admin/geminiIskraCore.js'

const GENDER_STORAGE_KEY = 'fit_gemini_gender'

const AUTO_SPEAK_KEY = 'fit_gemini_auto_speak'



let voicesPromise = null



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



function waitForVoices() {

  if (typeof window === 'undefined' || !window.speechSynthesis) {

    return Promise.resolve([])

  }

  if (voicesPromise) return voicesPromise

  voicesPromise = new Promise((resolve) => {

    const synth = window.speechSynthesis

    const done = () => resolve(synth.getVoices())

    const voices = synth.getVoices()

    if (voices.length) {

      resolve(voices)

      return

    }

    synth.onvoiceschanged = () => {

      synth.onvoiceschanged = null

      done()

    }

    setTimeout(done, 600)

  })

  return voicesPromise

}



/** Текст для TTS: без разметки, компактнее для уха. */

export function prepareTextForSpeech(text) {

  return String(text ?? '')

    .replace(/\*\*|__|`|#/g, '')

    .replace(/\s+/g, ' ')

    .trim()

}



/** @typedef {{ name?: string, lang?: string, voiceURI?: string }} SpeechVoiceLike */

/**
 * @param {SpeechVoiceLike} voice
 * @param {'male'|'female'} gender
 */
function scoreSpeechVoice(voice, gender) {
  const name = String(voice?.name ?? '')
  const lang = String(voice?.lang ?? '')
  const lower = name.toLowerCase()

  if (!/^ru(-|$)/i.test(lang) && !/рус/i.test(name)) return -1000

  let score = 0

  if (/microsoft/i.test(name)) score += 30
  if (/online/i.test(name)) score += 25
  if (/natural/i.test(name)) score += 15
  if (/google/i.test(name)) score -= 40

  if (gender === 'female') {
    if (/svetlana/i.test(lower)) score += 50
    if (/irina/i.test(lower)) score += 20
    if (/dmitri|dmitry|pavel|yuri|male|муж/i.test(lower)) score -= 50
    if (/female|жен|milena|katya|anna/i.test(lower)) score += 10
  } else {
    if (/dmitri|dmitry/i.test(lower)) score += 50
    if (/pavel|yuri/i.test(lower)) score += 15
    if (/svetlana|irina|milena|katya|anna|female|жен/i.test(lower)) score -= 50
    if (/male|муж/i.test(lower)) score += 10
  }

  return score
}

/**
 * Предпочитает облачные Microsoft Online (Natural) в Edge; Google — только если Microsoft нет.
 *
 * @param {'male'|'female'} gender
 * @param {SpeechVoiceLike[]} voices
 * @returns {SpeechVoiceLike | null}
 */
export function pickGeminiSpeechVoice(gender, voices) {
  const list = Array.isArray(voices) ? voices : []
  const ru = list.filter((v) => /^ru(-|$)/i.test(String(v?.lang ?? '')))
  const pool = ru.length ? ru : list
  if (!pool.length) return null

  const hasMicrosoft = pool.some((v) => /microsoft/i.test(String(v?.name ?? '')))
  const candidates = hasMicrosoft ? pool.filter((v) => !/google/i.test(String(v?.name ?? ''))) : pool

  let best = null
  let bestScore = -Infinity

  for (const voice of candidates) {
    const score = scoreSpeechVoice(voice, gender)
    if (score > bestScore) {
      bestScore = score
      best = voice
    }
  }

  return best
}

function pickVoice(gender, voices) {
  return pickGeminiSpeechVoice(gender, voices)
}



export async function speakGeminiText(text, gender = 'male') {

  if (typeof window === 'undefined' || !window.speechSynthesis) return false

  const clean = prepareTextForSpeech(text)

  if (!clean) return false



  const voices = await waitForVoices()

  const utter = new SpeechSynthesisUtterance(clean)

  utter.lang = 'ru-RU'

  utter.rate = gender === 'female' ? 0.94 : 0.98

  utter.pitch = gender === 'female' ? 1.02 : 0.93

  utter.volume = 1

  const voice = pickVoice(gender, voices)

  if (voice) utter.voice = voice



  window.speechSynthesis.cancel()

  window.speechSynthesis.speak(utter)

  return true

}



export function previewGeminiVoice(_gender = 'female') {
  void speakGeminiText(`${ISKRA_NAME} на связи. ЭВМ готова к работе`, _gender)
}



export function stopGeminiSpeech() {

  if (typeof window === 'undefined' || !window.speechSynthesis) return

  window.speechSynthesis.cancel()

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


