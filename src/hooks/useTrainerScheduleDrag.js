import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SCHEDULE_DRAG_EDGE_HOLD_MS,
  SCHEDULE_DRAG_HOLD_MS,
  SCHEDULE_DRAG_LOCKED,
  SCHEDULE_DRAG_MOVE_TOLERANCE_PX,
  isScheduleMoveNoop,
  resolveScheduleAutoScrollDelta,
  resolveScheduleDragDayIndex,
  resolveScheduleDragStartMinutes,
  resolveScheduleEdgeFlip,
} from '../lib/trainer/trainerScheduleDragCore.js'

/** Пока экран перелистывается, край не перепроверяем — колонки едут под пальцем. */
const EDGE_FLIP_SETTLE_MS = 260

/**
 * Перенос записи ежедневника долгим нажатием. Колонки дней в сетке помечены `data-schedule-day`.
 * onEdgeFlip — палец с записью держат у края: листаем экран (−1 / 1), запись остаётся в пальце,
 * так её можно унести на несколько недель. preview.entry — сама запись: после листания её строки
 * может уже не быть в загруженном окне, а «призрак» под пальцем должен остаться.
 * @param {{
 *   boardRef: { current: HTMLElement | null },
 *   dayIsos: string[],
 *   enabled: boolean,
 *   pxPerMin: number,
 *   dayStartMin: number,
 *   resolvePolicy: (entry: object) => string,
 *   onDrop: (entry: object, dayIso: string, startMinutes: number) => void,
 *   onLocked?: (entry: object) => void,
 *   onEdgeFlip?: (dir: -1 | 1) => void,
 * }} opts
 */
export function useTrainerScheduleDrag(opts) {
  const [preview, setPreview] = useState(
    /** @type {{ entryId: string, entry: object, dayIso: string, startMinutes: number, edge: number } | null} */ (null),
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
    window.clearTimeout(s.edgeTimer)
    for (const [type, fn] of s.listeners) window.removeEventListener(type, fn)
    for (const [type, fn] of s.elListeners) s.el.removeEventListener(type, fn)
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

  const publish = (s) => {
    setPreview({ entryId: String(s.entry.id), entry: s.entry, ...s.target, edge: s.edgeDir })
  }

  const watchEdge = (s, clientX, rects) => {
    const { onEdgeFlip } = optsRef.current
    const first = rects[0]
    const dir =
      onEdgeFlip && first && performance.now() >= s.settleUntil
        ? resolveScheduleEdgeFlip({
            clientX,
            startX: s.startX,
            left: first.left,
            right: rects[rects.length - 1].right,
            colWidth: first.right - first.left,
            policy: s.policy,
          })
        : 0
    if (dir === s.edgeDir) return false
    window.clearTimeout(s.edgeTimer)
    s.edgeDir = dir
    if (dir) {
      s.edgeTimer = window.setTimeout(() => {
        if (sessionRef.current !== s) return
        s.edgeDir = 0
        s.settleUntil = performance.now() + EDGE_FLIP_SETTLE_MS
        publish(s)
        optsRef.current.onEdgeFlip?.(dir)
        window.setTimeout(() => {
          if (sessionRef.current === s && s.lastPoint) updateTarget(s, s.lastPoint)
        }, EDGE_FLIP_SETTLE_MS + 20)
      }, SCHEDULE_DRAG_EDGE_HOLD_MS)
    }
    return true
  }

  const updateTarget = (s, ev) => {
    s.lastPoint = { clientX: ev.clientX, clientY: ev.clientY }
    const { boardRef, dayIsos, pxPerMin, dayStartMin } = optsRef.current
    const el = boardRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const delta = resolveScheduleAutoScrollDelta(ev.clientY, r.top, r.bottom)
      if (delta) el.scrollTop += delta
    }
    const rects = trackRects()
    if (!rects.length) return
    const edgeChanged = watchEdge(s, ev.clientX, rects)
    const dayIndex = resolveScheduleDragDayIndex(rects, ev.clientX, s.originIndex, s.policy)
    const startMinutes = resolveScheduleDragStartMinutes({
      pointerY: ev.clientY,
      grabOffsetY: s.grabOffsetY,
      trackTop: rects[dayIndex].top,
      pxPerMin,
      dayStartMin,
    })
    const dayIso = dayIsos[dayIndex]
    if (!edgeChanged && s.target.dayIso === dayIso && s.target.startMinutes === startMinutes) return
    s.target = { dayIso, startMinutes }
    publish(s)
  }

  /* После листания цель под неподвижным пальцем — уже день нового экрана. */
  const dayKey = opts.dayIsos.join('|')
  useEffect(() => {
    const s = sessionRef.current
    if (s?.active && s.lastPoint) updateTarget(s, s.lastPoint)
  }, [dayKey])

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
          el: /** @type {HTMLElement} */ (ev.currentTarget),
          originIndex,
          policy: resolvePolicy(entry),
          pointerId: ev.pointerId,
          isTouch: ev.pointerType === 'touch',
          startX: ev.clientX,
          startY: ev.clientY,
          grabOffsetY: ev.clientY - rect.top,
          active: false,
          target: { dayIso: day, startMinutes: Number(entry.start_minutes) },
          lastPoint: null,
          edgeDir: 0,
          edgeTimer: 0,
          settleUntil: 0,
          timer: 0,
          /** @type {[string, (e: any) => void, AddEventListenerOptions?][]} */
          listeners: [],
          /** @type {[string, (e: any) => void, AddEventListenerOptions?][]} */
          elListeners: [],
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
        const onTouchCancel = () => endSession()
        /* Запись ушла с экрана при листании: касание по-прежнему адресовано ей, но до window уже не всплывает. */
        const detachedOnly = (fn) => (e) => {
          if (!s.el.isConnected) fn(e)
        }
        s.listeners = [
          ['pointermove', onPointerMove],
          ['pointerup', onPointerUp],
          ['pointercancel', onPointerCancel],
          ['touchmove', onTouchMove, { passive: false }],
          ['touchend', onTouchEnd],
          ['touchcancel', onTouchCancel],
        ]
        s.elListeners = [
          ['touchmove', detachedOnly(onTouchMove), { passive: false }],
          ['touchend', detachedOnly(onTouchEnd)],
          ['touchcancel', detachedOnly(onTouchCancel)],
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
          publish(s)
        }, SCHEDULE_DRAG_HOLD_MS)
        sessionRef.current = s
        for (const [type, fn, o] of s.listeners) window.addEventListener(type, fn, o)
        for (const [type, fn, o] of s.elListeners) s.el.addEventListener(type, fn, o)
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
