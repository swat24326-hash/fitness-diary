import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  resolvePinchScheduleZoom,
  resolveScheduleZoomScrollTop,
  resolveWheelScheduleZoom,
} from '../lib/trainer/scheduleZoomCore.js'

/** @param {TouchList} touches */
function pinchOf(touches) {
  const [a, b] = [touches[0], touches[1]]
  return { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), midY: (a.clientY + b.clientY) / 2 }
}

/**
 * Щипок двумя пальцами и Ctrl+колёсико по сетке меняют масштаб; при любой смене масштаба
 * (и с кнопок меню) время под пальцами / в центре сетки остаётся на месте.
 * @param {{
 *   boardRef: { current: HTMLElement | null },
 *   zoom: number,
 *   onZoom?: (zoom: number) => void,
 *   isBlocked?: () => boolean,
 * }} opts
 */
export function useScheduleZoomGesture({ boardRef, zoom, onZoom, isBlocked }) {
  const optsRef = useRef({ zoom, onZoom, isBlocked })
  optsRef.current = { zoom, onZoom, isBlocked }
  const prevZoomRef = useRef(zoom)
  const scrollTopRef = useRef(0)
  const anchorClientYRef = useRef(/** @type {number | null} */ (null))
  const enabled = typeof onZoom === 'function'

  useLayoutEffect(() => {
    const el = boardRef.current
    const fromZoom = prevZoomRef.current
    prevZoomRef.current = zoom
    if (!el || fromZoom === zoom) return
    const rect = el.getBoundingClientRect()
    const track = el.querySelector('[data-schedule-day]')
    const trackOffset = track ? track.getBoundingClientRect().top - rect.top + el.scrollTop : 0
    const clientY = anchorClientYRef.current
    anchorClientYRef.current = null
    const anchorY = clientY == null ? el.clientHeight / 2 : Math.min(Math.max(0, clientY - rect.top), el.clientHeight)
    el.scrollTop = resolveScheduleZoomScrollTop({
      scrollTop: scrollTopRef.current,
      anchorY,
      trackOffset,
      fromZoom,
      toZoom: zoom,
    })
    scrollTopRef.current = el.scrollTop
  }, [boardRef, zoom])

  useEffect(() => {
    const el = boardRef.current
    if (!el) return undefined
    scrollTopRef.current = el.scrollTop
    let pinch = null
    let frame = 0
    let pending = null

    const apply = (next, clientY) => {
      pending = { next, clientY }
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const p = pending
        pending = null
        if (!p || p.next === optsRef.current.zoom) return
        anchorClientYRef.current = p.clientY
        optsRef.current.onZoom?.(p.next)
      })
    }

    const onScroll = () => {
      scrollTopRef.current = el.scrollTop
    }
    const onTouchStart = (e) => {
      if (!enabled || e.touches.length !== 2 || optsRef.current.isBlocked?.()) {
        pinch = null
        return
      }
      const { dist } = pinchOf(e.touches)
      pinch = { startDist: dist, startZoom: optsRef.current.zoom }
    }
    const onTouchMove = (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const { dist, midY } = pinchOf(e.touches)
      apply(resolvePinchScheduleZoom(pinch.startZoom, pinch.startDist, dist), midY)
    }
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinch = null
    }
    const onWheel = (e) => {
      if (!enabled || !e.ctrlKey) return
      e.preventDefault()
      const base = pending?.next ?? optsRef.current.zoom
      apply(resolveWheelScheduleZoom(base, e.deltaY), e.clientY)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
    }
  }, [boardRef, enabled])
}
