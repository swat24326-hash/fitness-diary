/**
 * Короткий звук «искра» при insight — mute по умолчанию (north star).
 * Включается вместе с автоозвучкой (кнопка Volume в доке).
 */

const CHIME_KEY = 'fit_iskra_insight_chime'

/** @returns {boolean} */
export function loadIskraInsightChimeEnabled() {
  try {
    return localStorage.getItem(CHIME_KEY) === '1'
  } catch {
    return false
  }
}

/** @param {boolean} enabled */
export function saveIskraInsightChimeEnabled(enabled) {
  try {
    localStorage.setItem(CHIME_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/**
 * Тихая двутональная вспышка. Без файла — Web Audio.
 * Не играет, если mute / reduced-motion / нет AudioContext.
 */
export function playIskraInsightChime() {
  if (!loadIskraInsightChimeEnabled()) return
  try {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
  } catch {
    /* ignore */
  }

  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null
  if (!AC) return

  try {
    const ctx = new AC()
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.045, now + 0.02)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    master.connect(ctx.destination)

    const tones = [
      { f: 880, t: 0, dur: 0.12 },
      { f: 1320, t: 0.07, dur: 0.16 },
    ]
    for (const { f, t, dur } of tones) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, now + t)
      g.gain.setValueAtTime(0.0001, now + t)
      g.gain.exponentialRampToValueAtTime(0.7, now + t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + dur)
      osc.connect(g)
      g.connect(master)
      osc.start(now + t)
      osc.stop(now + t + dur + 0.02)
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 400)
  } catch {
    /* ignore — без жеста/автоplay браузер может отказать */
  }
}
