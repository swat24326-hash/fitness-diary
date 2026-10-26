import { useCallback, useEffect, useRef, useState } from 'react'

const HOLD_MS = 280
const SLIDE_MS = 420

function frameUrl(file) {
  return `data:${file.mime};base64,${file.data}`
}

/**
 * Лента кадров: полоска сама доходит до конца и листает дальше.
 * Между разными сторис картинка уезжает, внутри одной — короткое проявление.
 */
export function useStoryReel({ flat, loadFrame, onClose, held = false }) {
  const [index, setIndex] = useState(0)
  const [shown, setShown] = useState(null)
  const [leaving, setLeaving] = useState(null)
  const [motion, setMotion] = useState('')
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const cache = useRef(new Map())
  const shownRef = useRef(null)
  const dirRef = useRef('forward')
  const onCloseRef = useRef(onClose)
  const stepRef = useRef(() => {})
  const holdAt = useRef(0)
  const suppressClick = useRef(false)
  const ended = useRef(-1)
  onCloseRef.current = onClose

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
        const next = { frameId, storyId, src: frameUrl(file) }
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
      onCloseRef.current()
      return
    }
    if (next < 0) return
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

  const bindZone = (delta) => ({
    onPointerDown: () => {
      holdAt.current = performance.now()
      setPaused(true)
    },
    onPointerUp: () => {
      if (performance.now() - holdAt.current >= HOLD_MS) suppressClick.current = true
      setPaused(false)
    },
    onPointerCancel: () => setPaused(false),
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

  return {
    index,
    current,
    shown,
    leaving,
    motion,
    paused: paused || held,
    error,
    playing: Boolean(shown && shown.frameId === frameId && !error),
    bindZone,
    onFillEnd,
  }
}
