/**
 * Звуки переписки: входящее — «Гиря» (металлическое «дзынь», как звякнувшие блины штанги),
 * отправка — «вжух» (шум, пролетающий снизу вверх).
 * Общее для проигрывателя Web Audio и файлов для прослушивания (scripts/render-chat-sounds.mjs).
 */

/** Металл: негармоничные призвуки [множитель частоты, громкость]. */
const METAL = [[1, 1], [2.76, 0.55], [5.4, 0.28], [8.93, 0.12]]

/** «Вжух»: полоса шума едет from → to Гц; пик громкости — на доле `peakAt` длительности. */
export const CHAT_WHOOSH = { from: 450, to: 3600, q: 1.4, dur: 0.28, vol: 0.55, peakAt: 0.45 }

export const CHAT_SOUNDS = {
  send: [{ whoosh: true, at: 0, dur: CHAT_WHOOSH.dur }],
  incoming: [
    { freq: 1100, at: 0, dur: 0.9, vol: 0.12 },
    { freq: 1480, at: 0.13, dur: 1.1, vol: 0.11 },
  ],
  inbox: [{ freq: 980, at: 0, dur: 0.9, vol: 0.12 }],
}

/**
 * Голоса одного удара: призвуки затухают быстрее основного тона.
 * @param {{ freq: number, dur: number, vol: number }} t
 * @returns {Array<{ freq: number, peak: number, dur: number }>}
 */
export function expandChatTone(t) {
  return METAL.map(([ratio, gain], k) => ({ freq: t.freq * ratio, peak: t.vol * gain, dur: t.dur / (1 + k * 0.8) }))
}

/**
 * Белый шум для «вжуха», одинаковый при каждом запуске.
 * @param {number} rate частота дискретизации
 */
export function buildWhooshNoise(rate) {
  const out = new Float32Array(Math.round(CHAT_WHOOSH.dur * rate))
  let seed = 4242
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    out[i] = seed / 1073741824 - 1
  }
  return out
}
