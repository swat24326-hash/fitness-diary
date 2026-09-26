/**
 * Подставить randomUUID на http://IP до импорта экранов (ESM: этот файл первым в main.jsx).
 * Только getRandomValues / lid — не через safeRandomUuid, иначе цикл.
 */
import { createSafeRandomUuidPolyfill } from './safeRandomUuid.js'

const c = globalThis.crypto
if (c && typeof c.randomUUID !== 'function') {
  const poly = createSafeRandomUuidPolyfill(c)
  try {
    Object.defineProperty(c, 'randomUUID', {
      value: poly,
      configurable: true,
    })
  } catch {
    try {
      c.randomUUID = poly
    } catch {
      /* ignore */
    }
  }
}
