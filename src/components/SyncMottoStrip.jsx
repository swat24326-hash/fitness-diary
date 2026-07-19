import { useEffect, useRef, useState } from 'react'
import { formatSyncMotto } from '../lib/syncMotivationCore'

const PAUSE_TOP_MS = 1200
const PAUSE_BOTTOM_MS = 1500
const PX_PER_MS = 1 / 1300 // ~1 line (≈18px) / 1.3s

/**
 * Sticky-полоска Sync: карточка читается целиком; длинный текст — вертикальный автоскролл.
 * @param {{
 *   card: { id: string, text: string, source?: string },
 *   tone?: 'ok' | 'warn' | 'err',
 * }} props
 */
export function SyncMottoStrip({ card, tone = 'ok' }) {
  const viewportRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const cardRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const [reducedMotion, setReducedMotion] = useState(false)
  const [needsScroll, setNeedsScroll] = useState(false)
  const { text, source } = formatSyncMotto(card)
  const cardKey = String(card?.id ?? text)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(!!mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    const inner = cardRef.current
    if (!viewport || !inner) return undefined

    let cancelled = false
    let raf = 0
    let ro = /** @type {ResizeObserver | null} */ (null)

    const measure = () => {
      if (cancelled) return
      const overflow = inner.scrollHeight - viewport.clientHeight > 2
      setNeedsScroll(overflow)
      if (!overflow || reducedMotion) {
        viewport.scrollTop = 0
      }
    }

    measure()
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(viewport)
      ro.observe(inner)
    }

    if (reducedMotion) {
      return () => {
        cancelled = true
        ro?.disconnect()
      }
    }

    let phase = 'top'
    let phaseStarted = performance.now()
    let scrollFrom = 0

    const tick = (now) => {
      if (cancelled) return
      const maxScroll = Math.max(0, inner.scrollHeight - viewport.clientHeight)
      if (maxScroll <= 2) {
        viewport.scrollTop = 0
        raf = requestAnimationFrame(tick)
        return
      }

      if (phase === 'top') {
        viewport.scrollTop = 0
        if (now - phaseStarted >= PAUSE_TOP_MS) {
          phase = 'down'
          phaseStarted = now
          scrollFrom = 0
        }
      } else if (phase === 'down') {
        const dist = (now - phaseStarted) * PX_PER_MS
        const next = Math.min(maxScroll, scrollFrom + dist)
        viewport.scrollTop = next
        if (next >= maxScroll - 0.5) {
          phase = 'bottom'
          phaseStarted = now
          viewport.scrollTop = maxScroll
        }
      } else if (phase === 'bottom') {
        viewport.scrollTop = maxScroll
        if (now - phaseStarted >= PAUSE_BOTTOM_MS) {
          phase = 'top'
          phaseStarted = now
          viewport.scrollTop = 0
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [cardKey, text, source, reducedMotion])

  return (
    <div
      className={`sync-motto sync-motto--${tone}${reducedMotion && needsScroll ? ' sync-motto--expand' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div ref={viewportRef} className="sync-motto__viewport">
        <div key={cardKey} ref={cardRef} className="sync-motto__card sync-motto__card--in">
          <p className="sync-motto__text">{text}</p>
          {source ? <p className="sync-motto__source">— {source}</p> : null}
        </div>
      </div>
    </div>
  )
}
