import { useCallback, useEffect, useRef } from 'react'
import { chatReplySwipeOffset, isChatReplySwipe } from '../lib/chat/chatReplyCore.js'

const HOLD_MS = 450
const MOVE_PX = 10
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_PX = 30
const TOUCH_DBLCLICK_MS = 600

/** По ссылке и кнопке двойной тап — их собственное нажатие, не реакция. */
const onControl = (e) => Boolean(e.target?.closest?.('a, button'))

function resetSwipe(s) {
  if (!s) return
  s.el.style.transform = ''
  s.el.classList.remove('is-swiping')
}

/**
 * Долгое нажатие на сообщение (палец) или правая кнопка мыши — как в Telegram; двойной тап / двойной клик — onDouble;
 * свайп пальцем влево — onSwipe («Ответить»). Листание ленты (палец сдвинулся) нажатием не считается.
 * @param {(payload: any, el: HTMLElement) => void} onPress
 * @param {(payload: any) => void} [onDouble]
 * @param {(payload: any) => void} [onSwipe]
 * @returns {(payload: any) => object} обработчики для элемента
 */
export function useChatLongPress(onPress, onDouble, onSwipe) {
  const pressRef = useRef(null)
  /** Палец удержали — отпускание того же касания не должно открыть ссылку под ним. */
  const swallowRef = useRef(false)
  const lastTapRef = useRef(null)
  const doubleAtRef = useRef(0)
  const swipeRef = useRef(null)
  const onPressRef = useRef(onPress)
  const onDoubleRef = useRef(onDouble)
  const onSwipeRef = useRef(onSwipe)
  onPressRef.current = onPress
  onDoubleRef.current = onDouble
  onSwipeRef.current = onSwipe

  const cancel = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer)
    pressRef.current = null
  }, [])
  const endSwipe = useCallback(() => {
    const s = swipeRef.current
    swipeRef.current = null
    resetSwipe(s)
    return s
  }, [])
  useEffect(() => () => {
    cancel()
    endSwipe()
  }, [cancel, endSwipe])

  const fire = useCallback((payload, el) => {
    cancel()
    lastTapRef.current = null
    onPressRef.current(payload, el)
  }, [cancel])

  return useCallback(
    (payload) => ({
      onPointerDown: (e) => {
        swallowRef.current = false
        if (e.pointerType === 'mouse') return
        cancel()
        endSwipe()
        const el = e.currentTarget
        if (onSwipeRef.current) swipeRef.current = { el, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }
        pressRef.current = {
          x: e.clientX,
          y: e.clientY,
          timer: window.setTimeout(() => {
            swallowRef.current = true
            endSwipe()
            navigator.vibrate?.(10)
            fire(payload, el)
          }, HOLD_MS),
        }
      },
      onPointerMove: (e) => {
        const p = pressRef.current
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_PX) {
          cancel()
          lastTapRef.current = null
        }
        const s = swipeRef.current
        if (!s) return
        s.dx = e.clientX - s.x
        s.dy = e.clientY - s.y
        const shift = Math.abs(s.dx) > Math.abs(s.dy) ? chatReplySwipeOffset(s.dx) : 0
        s.el.classList.toggle('is-swiping', shift !== 0)
        s.el.style.transform = shift ? `translateX(${shift}px)` : ''
      },
      onPointerUp: (e) => {
        const tapped = Boolean(pressRef.current)
        cancel()
        const s = endSwipe()
        if (s && isChatReplySwipe(s.dx, s.dy)) {
          lastTapRef.current = null
          navigator.vibrate?.(10)
          onSwipeRef.current?.(payload)
          return
        }
        if (!tapped || e.pointerType === 'mouse' || !onDoubleRef.current || onControl(e)) return
        const prev = lastTapRef.current
        const now = { t: Date.now(), x: e.clientX, y: e.clientY, key: payload?.id ?? payload }
        if (prev && prev.key === now.key && now.t - prev.t < DOUBLE_TAP_MS && Math.hypot(now.x - prev.x, now.y - prev.y) < DOUBLE_TAP_PX) {
          lastTapRef.current = null
          doubleAtRef.current = now.t
          onDoubleRef.current(payload)
        } else {
          lastTapRef.current = now
        }
      },
      onPointerCancel: () => {
        cancel()
        endSwipe()
      },
      onPointerLeave: cancel,
      onContextMenu: (e) => {
        e.preventDefault()
        fire(payload, e.currentTarget)
      },
      onDoubleClick: (e) => {
        // Телефон после двойного тапа может прислать ещё и dblclick — реакция уже поставлена, второй раз сняла бы её.
        if (!onDoubleRef.current || onControl(e) || Date.now() - doubleAtRef.current < TOUCH_DBLCLICK_MS) return
        window.getSelection?.()?.removeAllRanges()
        onDoubleRef.current(payload)
      },
      onClickCapture: (e) => {
        if (!swallowRef.current) return
        swallowRef.current = false
        e.preventDefault()
        e.stopPropagation()
      },
    }),
    [cancel, endSwipe, fire],
  )
}
