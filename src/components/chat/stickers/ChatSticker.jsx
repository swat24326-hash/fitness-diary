import { useId, useState } from 'react'
import { chatStickerLabel } from '../../../lib/chat/chatStickerCore.js'
import { STICKER_SHAPES } from './chatStickerShapes.jsx'

/**
 * Стикер клуба как в Telegram: Гирька с белой «вырезной» обводкой, анимация при появлении,
 * нажатие в ленте — проиграть ещё раз. Подпись нужна «полезным» стикерам («Опаздываю ~10 минут»).
 * @param {{ id: string, size?: 'feed'|'pick' }} props
 */
export function ChatSticker({ id, size = 'feed' }) {
  const gid = `stk${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [round, setRound] = useState(0)
  const Shape = STICKER_SHAPES[id]
  const label = chatStickerLabel(id)
  if (!Shape) return null
  return (
    <span
      className={`chat-sticker chat-sticker--${size}`}
      role="img"
      aria-label={`Стикер: ${label}`}
      onClick={size === 'feed' ? () => setRound((n) => n + 1) : undefined}
    >
      <svg key={round} viewBox="-6 -6 132 132" className="chat-sticker__art" aria-hidden focusable="false">
        <defs>
          <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" className="stk-stop-bright" />
            <stop offset="1" className="stk-stop-dim" />
          </linearGradient>
          <filter id={`${gid}o`} x="-15%" y="-15%" width="130%" height="130%">
            <feMorphology in="SourceAlpha" operator="dilate" radius="3.2" result="grow" />
            <feFlood className="stk-cut" result="paint" />
            <feComposite in="paint" in2="grow" operator="in" result="cut" />
            <feMerge>
              <feMergeNode in="cut" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${gid}o)`}>
          <Shape a={`url(#${gid}a)`} />
        </g>
      </svg>
      <span className="chat-sticker__label">{label}</span>
    </span>
  )
}
