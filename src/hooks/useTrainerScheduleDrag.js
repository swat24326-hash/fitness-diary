import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SCHEDULE_DRAG_HOLD_MS,
  SCHEDULE_DRAG_LOCKED,
  SCHEDULE_DRAG_MOVE_TOLERANCE_PX,
  isScheduleMoveNoop,
  resolveScheduleAutoScrollDelta,
  resolveScheduleDragDayIndex,
  resolveScheduleDragStartMinutes,
} from '../lib/trainer/trainerScheduleDragCore.js'

/**
 * Перенос записи ежедневника долгим нажатием. Колонки дней в сетке помечены `data-schedule-day`.
 * @param {{
 *   boardRef: { current: HTMLElement | null },
 *   dayIsos: string[],
 *   enabled: boolean,
 *   pxPerMin: number,
 *   dayStartMin: number,
 *   resolvePolicy: (entry: object) => string,
 *   onDrop: (entry: object, dayIso: string, startMinutes: number) => void,
 *   onLocked?: (entry: object) => void,
 * }} opts
 */
export function useTrainerScheduleDrag(opts) {
  const [preview, setPreview] = useState(
    /** @type {{ entryId: string, dayIso: string, startMinutes: number } | null} */ (null),
  )
  const optsRef = useRef(opts)
  const sessionRef = useRef(/** @type {any} */ (null))
  const suppressClickRef = useRef(false)

  useEffect(() => {
    optsRef.current = opts
  })

  const endSession = useCallback(() => {
    const s = sessionRef.current
    if (!s) return
    window.clearTimeout(s.timer)
    for (const [type, fn] of s.listeners) window.removeEventListener(type, fn)
    sessionRef.current = null
    setPreview(null)
  }, [])

  useEffect(() => endSession, [endSession])

  const trackRects = () => {
    const el = optsRef.current.boardRef.current
    if (!el) return []
    return optsRef.current.dayIsos.map((day) => {
      const track = el.querySelector(`[data-schedule-day="${day}"]`)
      return track ? track.getBoundingClientRect() : { left: 0, right: 0, top: 0 }
    })
  }

  const updateTarget = (s, ev) => {
    const { boardRef, dayIsos, pxPerMin, dayStartMin } = optsRef.current
    const el = boardRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const delta = resolveScheduleAutoScrollDelta(ev.clientY, r.top, r.bottom)
      if (delta) el.scrollTop += delta
    }
    const rects = trackRects()
    if (!rects.length) return
    const dayIndex = resolveScheduleDragDayIndex(rects, ev.clientX, s.originIndex, s.policy)
    const startMinutes = resolveScheduleDragStartMinutes({
      pointerY: ev.clientY,
      grabOffsetY: s.grabOffsetY,
      trackTop: rects[dayIndex].top,
      pxPerMin,
      dayStartMin,
    })
    const dayIso = dayIsos[dayIndex]
    if (s.target.dayIso === dayIso && s.target.startMinutes === startMinutes) return
    s.target = { dayIso, startMinutes }
    setPreview({ entryId: String(s.entry.id), dayIso, startMinutes })
  }

  const getEntryHandlers = (entry) => {
    if (!opts.enabled) return {}
    return {
      onPointerDown: (ev) => {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return
        endSession()
        suppressClickRef.current = false
        const { dayIsos, resolvePolicy } = optsRef.current
        const day = String(entry.day_date ?? '').slice(0, 10)
        const originIndex = dayIsos.indexOf(day)
        if (originIndex < 0) return
        const rect = ev.currentTarget.getBoundingClientRect()
        const s = {
          entry,
          originIndex,
          policy: resolvePolicy(entry),
          pointerId: ev.pointerId,
          isTouch: ev.pointerType === 'touch',
          startX: ev.clientX,
          startY: ev.clientY,
          grabOffsetY: ev.clientY - rect.top,
          active: false,
          target: { dayIso: day, startMinutes: Number(entry.start_minutes) },
          timer: 0,
          /** @type {[string, (e: any) => void, AddEventListenerOptions?][]} */
          listeners: [],
        }
        const finish = () => {
          const { active, target } = s
          endSession()
          if (!active || isScheduleMoveNoop(entry, target.dayIso, target.startMinutes)) return
          optsRef.current.onDrop(entry, target.dayIso, target.startMinutes)
        }
        const onPointerMove = (e) => {
          if (e.pointerId !== s.pointerId) return
          if (!s.active) {
            if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > SCHEDULE_DRAG_MOVE_TOLERANCE_PX) endSession()
            return
          }
          if (!s.isTouch) updateTarget(s, e)
        }
        const onPointerUp = (e) => {
          if (e.pointerId === s.pointerId) finish()
        }
        /* Касание после подъёма ведём touch-событиями: pointercancel от браузера тут не конец жеста. */
        const onPointerCancel = (e) => {
          if (e.pointerId !== s.pointerId) return
          if (!(s.active && s.isTouch)) endSession()
        }
        /* Слушатель ставится до touchstart — браузер ждёт его решения и не начинает скролл поднятой записи. */
        const onTouchMove = (e) => {
          if (!s.active) return
          e.preventDefault()
          const t = e.touches?.[0]
          if (t) updateTarget(s, t)
        }
        const onTouchEnd = () => {
          if (s.active) finish()
        }
        s.listeners = [
          ['pointermove', onPointerMove],
          ['pointerup', onPointerUp],
          ['pointercancel', onPointerCancel],
          ['touchmove', onTouchMove, { passive: false }],
          ['touchend', onTouchEnd],
          ['touchcancel', () => endSession()],
        ]
        s.timer = window.setTimeout(() => {
          if (sessionRef.current !== s) return
          suppressClickRef.current = true
          if (s.policy === SCHEDULE_DRAG_LOCKED) {
            endSession()
            optsRef.current.onLocked?.(entry)
            return
          }
          s.active = true
          navigator.vibrate?.(15)
          setPreview({ entryId: String(entry.id), dayIso: s.target.dayIso, startMinutes: s.target.startMinutes })
        }, SCHEDULE_DRAG_HOLD_MS)
        sessionRef.current = s
        for (const [type, fn, o] of s.listeners) window.addEventListener(type, fn, o)
      },
      onContextMenu: (ev) => ev.preventDefault(),
    }
  }

  /** После переноса тап по записи не открывает форму. */
  const consumeSuppressedClick = () => {
    if (!suppressClickRef.current) return false
    suppressClickRef.current = false
    return true
  }

  return { preview, getEntryHandlers, consumeSuppressedClick }
}
