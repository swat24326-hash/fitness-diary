import { useCallback, useEffect, useRef, useState } from 'react'
import { STORY_PHOTO_SEC, storyMimeIsVideo } from '../../lib/stories/storyClubCore.js'
import { storySwipeIntent } from '../../lib/stories/storyGestureCore.js'

const HOLD_MS = 280
const SLIDE_MS = 420

function frameUrl(file) {
  return `data:${file.mime};base64,${file.data}`
}

/**
 * Лента кадров: полоска сама доходит до конца и листает дальше.
 * Жест вниз — закрыть; влево/вправо — соседний автор (onPeer).
 */
export function useStoryReel({ flat, loadFrame, onClose, onPeer, held = false }) {
  const [index, setIndex] = useState(0)
  const [shown, setShown] = useState(null)
  const [leaving, setLeaving] = useState(null)
  const [motion, setMotion] = useState('')
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [fillSec, setFillSec] = useState(STORY_PHOTO_SEC)
  const [dragY, setDragY] = useState(0)
  const cache = useRef(new Map())
  const shownRef = useRef(null)
  const dirRef = useRef('forward')
  const onCloseRef = useRef(onClose)
  const onPeerRef = useRef(onPeer)
  const stepRef = useRef(() => {})
  const holdAt = useRef(0)
  const suppressClick = useRef(false)
  const ended = useRef(-1)
  const ptr = useRef({ x: 0, y: 0, dragging: false })
  onCloseRef.current = onClose
  onPeerRef.current = onPeer

  const current = flat[index]
  const frameId = current?.frame.id
  const storyId = current?.story.id

  const reveal = useCallback((next) => {
    const prev = shownRef.current
    if (prev && prev.storyId !== next.storyId) {
      setLeaving(prev)
      setMotion(dirRef.current === 'back' ? 'back' : 'forward')
    } else if (prev && prev.frameId !== next.frameId) {
      setLeaving(null)
      setMotion('frame')
    }
    shownRef.current = next
    setShown(next)
    setFillSec(storyMimeIsVideo(next.mime) ? Math.max(STORY_PHOTO_SEC, Number(next.sec) || STORY_PHOTO_SEC) : STORY_PHOTO_SEC)
  }, [])

  useEffect(() => {
    if (!frameId || !storyId) return undefined
    const cached = cache.current.get(frameId)
    if (cached) {
      reveal(cached)
      setError('')
      return undefined
    }
    let alive = true
    setError('')
    loadFrame(storyId, frameId)
      .then((file) => {
        const next = {
          frameId,
          storyId,
          src: frameUrl(file),
          mime: file.mime,
          sec: file.sec ?? null,
        }
        cache.current.set(frameId, next)
        if (alive) reveal(next)
      })
      .catch((e) => {
        if (alive) setError(e?.message || 'Не получилось загрузить')
      })
    return () => {
      alive = false
    }
  }, [frameId, storyId, loadFrame, reveal])

  useEffect(() => {
    const next = flat[index + 1]
    if (!next || cache.current.has(next.frame.id)) return undefined
    let alive = true
    loadFrame(next.story.id, next.frame.id)
      .then((file) => {
        if (!alive) return
        cache.current.set(next.frame.id, {
          frameId: next.frame.id,
          storyId: next.story.id,
          src: frameUrl(file),
          mime: file.mime,
          sec: file.sec ?? null,
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [flat, index, loadFrame])

  useEffect(() => {
    if (!leaving) return undefined
    const t = setTimeout(() => setLeaving(null), SLIDE_MS)
    return () => clearTimeout(t)
  }, [leaving])

  useEffect(() => {
    const onVis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  stepRef.current = (delta) => {
    const next = index + delta
    if (next >= flat.length) {
      if (onPeerRef.current?.(1)) return
      onCloseRef.current()
      return
    }
    if (next < 0) {
      onPeerRef.current?.(-1)
      return
    }
    ended.current = index
    dirRef.current = delta > 0 ? 'forward' : 'back'
    setIndex(next)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key === 'ArrowRight') stepRef.current(1)
      if (e.key === 'ArrowLeft') stepRef.current(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const finishPtr = (e) => {
    const dx = e.clientX - ptr.current.x
    const dy = e.clientY - ptr.current.y
    setDragY(0)
    ptr.current.dragging = false
    const intent = storySwipeIntent({ dx, dy })
    if (intent === 'close') {
      suppressClick.current = true
      setPaused(false)
      onCloseRef.current()
      return
    }
    if (intent === 'peer-next') {
      suppressClick.current = true
      setPaused(false)
      if (!onPeerRef.current?.(1)) stepRef.current(1)
      return
    }
    if (intent === 'peer-prev') {
      suppressClick.current = true
      setPaused(false)
      if (!onPeerRef.current?.(-1)) stepRef.current(-1)
      return
    }
    if (performance.now() - holdAt.current >= HOLD_MS) suppressClick.current = true
    setPaused(false)
  }

  const bindZone = (delta) => ({
    onPointerDown: (e) => {
      holdAt.current = performance.now()
      ptr.current = { x: e.clientX, y: e.clientY, dragging: true }
      setPaused(true)
      setDragY(0)
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    },
    onPointerMove: (e) => {
      if (!ptr.current.dragging) return
      const dy = e.clientY - ptr.current.y
      const dx = e.clientX - ptr.current.x
      if (dy > 0 && Math.abs(dy) >= Math.abs(dx)) setDragY(Math.min(160, dy * 0.85))
      else setDragY(0)
    },
    onPointerUp: finishPtr,
    onPointerCancel: () => {
      setDragY(0)
      ptr.current.dragging = false
      setPaused(false)
    },
    onClick: () => {
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      stepRef.current(delta)
    },
  })

  const onFillEnd = (e) => {
    if (e.animationName !== 'stories-fill') return
    if (ended.current === index) return
    ended.current = index
    stepRef.current(1)
  }

  const onVideoMeta = (sec) => {
    const n = Math.round(Number(sec) || 0)
    if (n >= 1) setFillSec(n)
  }

  const onVideoEnded = () => {
    if (ended.current === index) return
    ended.current = index
    stepRef.current(1)
  }

  return {
    index,
    current,
    shown,
    leaving,
    motion,
    paused: paused || held,
    error,
    fillSec,
    dragY,
    playing: Boolean(shown && shown.frameId === frameId && !error),
    bindZone,
    onFillEnd,
    onVideoMeta,
    onVideoEnded,
  }
}
