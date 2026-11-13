/**
 * Прогрев кадров сторис до открытия: меньше «Загружаем…» на телефоне.
 * Хранит сырой ответ API ({ blob, mime } | { data, mime }), не object URL.
 */

/** @type {Map<string, Promise<object> | object>} */
const warm = new Map()

/**
 * @param {string} frameId
 * @param {() => Promise<object>} loader
 * @returns {Promise<object>}
 */
export function warmStoryFrame(frameId, loader) {
  const id = String(frameId || '')
  if (!id) return loader()
  const hit = warm.get(id)
  if (hit) return Promise.resolve(hit).then((file) => file)
  const pending = Promise.resolve()
    .then(() => loader())
    .then((file) => {
      warm.set(id, file)
      return file
    })
    .catch((e) => {
      warm.delete(id)
      throw e
    })
  warm.set(id, pending)
  return pending
}

/** @param {string} frameId */
export function peekStoryFrameWarm(frameId) {
  const hit = warm.get(String(frameId || ''))
  if (!hit || typeof hit.then === 'function') return null
  return hit
}
