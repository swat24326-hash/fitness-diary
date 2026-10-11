/** Service worker получил push (public/push-sw.js) — открытое приложение обновляет числа и ленту сразу. */

export const PUSH_RECEIVED_TYPE = 'push-received'

/**
 * @param {(msg: { url?: string, tag?: string }) => void} onPush
 * @returns {() => void}
 */
export function onPushReceived(onPush) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return () => {}
  const onMessage = (event) => {
    if (event?.data?.type === PUSH_RECEIVED_TYPE) onPush(event.data)
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}
