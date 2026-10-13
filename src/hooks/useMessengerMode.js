import { useSyncExternalStore } from 'react'
import { MSGR_MONITOR_MIN, MSGR_PHONE_MAX, messengerModeOf } from '../lib/chat/messengerColumnsCore.js'

const QUERIES = [`(max-width: ${MSGR_PHONE_MAX}px)`, `(min-width: ${MSGR_MONITOR_MIN}px)`]

function subscribe(onChange) {
  const lists = QUERIES.map((q) => window.matchMedia(q))
  for (const l of lists) l.addEventListener('change', onChange)
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange)
  }
}

const widthNow = () => window.innerWidth

/**
 * Вид мессенджера: 'phone' | 'tablet' | 'monitor'. Перерисовка — только при переходе через границу вида.
 * @param {boolean} [compact] экран сам узкий (телефон тренера) — всегда одна панель
 */
export function useMessengerMode(compact = false) {
  const width = useSyncExternalStore(subscribe, widthNow, () => 1024)
  return messengerModeOf({ width, compact })
}
