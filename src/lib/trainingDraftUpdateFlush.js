/**
 * Регистрация flush черновика тренировки перед обновлением PWA.
 * Страница тренировки регистрирует колбэк; apply ждёт все flush.
 */

/** @type {Set<() => void | Promise<void>>} */
const flushers = new Set()

/**
 * @param {() => void | Promise<void>} fn
 * @returns {() => void}
 */
export function registerTrainingDraftUpdateFlush(fn) {
  if (typeof fn !== 'function') return () => {}
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

/**
 * Синхронно/async дописать черновики на диск перед reload.
 * Ошибки глотаем — обновление всё равно должно пройти после best-effort.
 */
export async function flushTrainingDraftsBeforePwaUpdate() {
  const list = [...flushers]
  if (!list.length) return { flushed: 0 }
  await Promise.all(
    list.map(async (fn) => {
      try {
        await fn()
      } catch {
        /* best-effort */
      }
    }),
  )
  return { flushed: list.length }
}
