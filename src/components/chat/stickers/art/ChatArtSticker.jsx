import { useEffect, useId, useRef, useState } from 'react'
import { chatStickerLabel } from '../../../../lib/chat/chatStickerCore.js'
import { ArtDance } from './ArtDance.jsx'
import { ArtGlutes } from './ArtGlutes.jsx'
import { ArtNoLegs } from './ArtNoLegs.jsx'
import { ArtShake } from './ArtShake.jsx'
import { ArtStrut } from './ArtStrut.jsx'

/** Рисунок и сколько играть при появлении (целое число циклов анимации). */
const ART = {
  glutes: { Art: ArtGlutes, playMs: 3900 },
  dance: { Art: ArtDance, playMs: 3600 },
  shake: { Art: ArtShake, playMs: 6400 },
  'no-legs': { Art: ArtNoLegs, playMs: 6400 },
  strut: { Art: ArtStrut, playMs: 4800 },
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * Растровый анимированный стикер: в ленте играет несколько циклов при появлении и по нажатию,
 * в панели выбора стоит на первом кадре (несколько фильтров сразу тяжелы для планшета).
 * @param {{ id: string, size?: 'feed'|'pick' }} props
 */
export function ChatArtSticker({ id, size = 'feed' }) {
  const uid = `ast${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const svgRef = useRef(null)
  const [round, setRound] = useState(0)
  const [playing, setPlaying] = useState(size === 'feed')
  const entry = ART[id]
  const playMs = entry?.playMs ?? 0

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return undefined
    if (!playing || reducedMotion()) {
      svg.pauseAnimations()
      svg.setCurrentTime(0)
      return undefined
    }
    svg.unpauseAnimations()
    const timer = setTimeout(() => setPlaying(false), playMs)
    return () => clearTimeout(timer)
  }, [playing, round, playMs])

  if (!entry) return null
  const { Art } = entry
  const label = chatStickerLabel(id)
  const replay = () => {
    setRound((n) => n + 1)
    setPlaying(true)
  }
  return (
    <span
      className={`chat-sticker chat-sticker--${size} chat-art-sticker${playing ? '' : ' is-still'}`}
      role="img"
      aria-label={`Стикер: ${label}`}
      onClick={size === 'feed' ? replay : undefined}
    >
      <svg key={round} ref={svgRef} viewBox="0 0 300 300" className="chat-sticker__art" aria-hidden focusable="false">
        <Art uid={uid} />
      </svg>
      <span className="chat-sticker__label">{label}</span>
    </span>
  )
}
