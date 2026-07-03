const GENDER_STORAGE_KEY = 'fit_gemini_gender'

export function loadGeminiGender() {
  try {
    const v = localStorage.getItem(GENDER_STORAGE_KEY)
    return v === 'female' ? 'female' : 'male'
  } catch {
    return 'male'
  }
}

export function saveGeminiGender(gender) {
  try {
    localStorage.setItem(GENDER_STORAGE_KEY, gender === 'female' ? 'female' : 'male')
  } catch {
    /* ignore */
  }
}

function pickVoice(gender, voices) {
  const ru = voices.filter((v) => /^ru/i.test(v.lang))
  if (!ru.length) return voices[0] ?? null
  if (gender === 'female') {
    return (
      ru.find((v) => /female|milena|katya|anna|жен/i.test(v.name)) ??
      ru.find((v) => !/male|dmitri|pavel|муж/i.test(v.name)) ??
      ru[0]
    )
  }
  return (
    ru.find((v) => /male|dmitri|pavel|yuri|муж/i.test(v.name)) ??
    ru[0]
  )
}

export function speakGeminiText(text, gender = 'male') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  const utter = new SpeechSynthesisUtterance(String(text ?? '').trim())
  utter.lang = 'ru-RU'
  utter.rate = 1.02
  const voices = window.speechSynthesis.getVoices()
  const voice = pickVoice(gender, voices)
  if (voice) utter.voice = voice
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
  return true
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
