import { useCallback, useEffect, useState } from 'react'
import {
  SCHEDULE_ZOOM_DEFAULTS,
  SCHEDULE_ZOOM_MAX,
  SCHEDULE_ZOOM_MIN,
  clampScheduleZoom,
  parseStoredScheduleZoom,
  scheduleZoomStorageKey,
  stepScheduleZoom,
} from '../lib/trainer/scheduleZoomCore.js'

const SAVE_DELAY_MS = 300

/** @param {string} key @param {number} fallback */
function readZoom(key, fallback) {
  try {
    return parseStoredScheduleZoom(localStorage.getItem(key), fallback)
  } catch {
    return fallback
  }
}

/**
 * Масштаб сетки ежедневника, запоминается на устройстве отдельно для планшета / телефона / админки.
 * @param {'tablet' | 'phone' | 'admin'} scope
 */
export function useScheduleZoom(scope) {
  const base = SCHEDULE_ZOOM_DEFAULTS[scope] ?? SCHEDULE_ZOOM_DEFAULTS.tablet
  const key = scheduleZoomStorageKey(scope)
  const [zoom, setZoomState] = useState(() => readZoom(key, base))

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (zoom === base) localStorage.removeItem(key)
        else localStorage.setItem(key, String(zoom))
      } catch {
        /* приватный режим — масштаб живёт до перезагрузки */
      }
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [key, zoom, base])

  const setZoom = useCallback((value) => setZoomState((prev) => clampScheduleZoom(value, prev)), [])

  return {
    zoom,
    base,
    setZoom,
    zoomIn: () => setZoomState((prev) => stepScheduleZoom(prev, 1)),
    zoomOut: () => setZoomState((prev) => stepScheduleZoom(prev, -1)),
    reset: () => setZoomState(base),
    canZoomIn: zoom < SCHEDULE_ZOOM_MAX,
    canZoomOut: zoom > SCHEDULE_ZOOM_MIN,
  }
}
