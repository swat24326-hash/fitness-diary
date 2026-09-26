/**
 * UUID без обязательного HTTPS: crypto.randomUUID есть только в «защищённом» контексте.
 * На Hybrid A (http://IP:порт) его нет — старт тренировки падал.
 * Подстановка на crypto не должна звать сама себя (иначе Maximum call stack).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const POLYFILL_FLAG = '__fdSafeRandomUuid'

/**
 * @param {unknown} fn
 * @returns {boolean}
 */
export function isSafeRandomUuidPolyfill(fn) {
  return typeof fn === 'function' && fn[POLYFILL_FLAG] === true
}

/**
 * @param {unknown} cryptoLike
 * @returns {string}
 */
export function uuidFromEntropy(cryptoLike) {
  const c = cryptoLike
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    c.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `lid-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * @param {unknown} cryptoLike
 * @returns {() => string}
 */
export function createSafeRandomUuidPolyfill(cryptoLike) {
  const fn = () => uuidFromEntropy(cryptoLike)
  fn[POLYFILL_FLAG] = true
  return fn
}

/**
 * @param {unknown} cryptoLike
 * @returns {string}
 */
export function safeRandomUuid(cryptoLike = globalThis.crypto) {
  const c = cryptoLike
  const native = c && typeof c.randomUUID === 'function' ? c.randomUUID : null
  if (native && !isSafeRandomUuidPolyfill(native)) {
    return native.call(c)
  }
  return uuidFromEntropy(c)
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isUuidLike(value) {
  return UUID_RE.test(String(value ?? ''))
}
