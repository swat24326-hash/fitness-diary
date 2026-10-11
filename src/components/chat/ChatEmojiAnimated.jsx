import { useEffect, useRef, useState } from 'react'
import { notoEmojiLottieUrl } from '../../lib/chat/chatEmojiNotoCore.js'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'

const animations = new Map()
let player = null

function loadAnimation(key) {
  if (!animations.has(key)) {
    const p = fetch(notoEmojiLottieUrl(key)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    p.catch(() => animations.delete(key))
    animations.set(key, p)
  }
  return animations.get(key)
}

function loadPlayer() {
  player ??= import('lottie-web/build/player/lottie_light').then((m) => m.default ?? m)
  return player
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Крупный смайлик как в Telegram: Lottie-анимация (вектор — чёткий на любом экране), играет, пока виден.
 * До загрузки и без сети — та же картинка без движения.
 * @param {{ emoji: string, emojiKey: string }} props
 */
export function ChatEmojiAnimated({ emoji, emojiKey }) {
  const boxRef = useRef(/** @type {HTMLSpanElement | null} */ (null))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (reducedMotion()) return undefined
    let anim = null
    let observer = null
    let cancelled = false
    Promise.all([loadPlayer(), loadAnimation(emojiKey)])
      .then(([lottie, json]) => {
        if (cancelled || !boxRef.current) return
        /* Свой объект на каждый смайлик: lottie дописывает в данные служебные поля. */
        const animationData = JSON.parse(json)
        anim = lottie.loadAnimation({ container: boxRef.current, renderer: 'svg', loop: true, autoplay: true, animationData })
        setReady(true)
        observer = new IntersectionObserver(([e]) => (e.isIntersecting ? anim.play() : anim.pause()))
        observer.observe(boxRef.current)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      observer?.disconnect()
      anim?.destroy()
    }
  }, [emojiKey])

  return (
    <span className="chat-emoji-anim" role="img" aria-label={emoji}>
      <span ref={boxRef} className="chat-emoji-anim__player" aria-hidden />
      {ready ? null : <ChatEmojiGlyph emoji={emoji} emojiKey={emojiKey} className="chat-emoji-anim__still" />}
    </span>
  )
}
