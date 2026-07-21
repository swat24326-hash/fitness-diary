import { useId } from 'react'

/**
 * Фирменный орб ИСКРЫ — idle / listen / think / insight.
 * CSS/SVG, без Lottie. Стили: src/styles/iskra-orb.css
 *
 * @param {{
 *   state?: 'idle' | 'listen' | 'think' | 'insight',
 *   size?: number,
 *   interactive?: boolean,
 *   onClick?: () => void,
 *   ariaLabel?: string,
 *   className?: string,
 * }} props
 */
export function IskraOrb({
  state = 'idle',
  size = 44,
  interactive = false,
  onClick,
  ariaLabel,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const coreId = `iskra-orb-core-${uid}`
  const glowId = `iskra-orb-glow-${uid}`
  const safeState = ['idle', 'listen', 'think', 'insight'].includes(state) ? state : 'idle'
  const Tag = interactive ? 'button' : 'div'
  const interactiveProps = interactive
    ? { type: 'button', onClick, 'aria-label': ariaLabel || 'ИСКРА' }
    : { 'aria-hidden': true }

  return (
    <Tag
      className={`iskra-orb iskra-orb--${safeState}${interactive ? ' iskra-orb--interactive' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      {...interactiveProps}
    >
      <span className="iskra-orb__ring iskra-orb__ring--1" aria-hidden />
      <span className="iskra-orb__ring iskra-orb__ring--2" aria-hidden />
      <svg className="iskra-orb__svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden>
        <defs>
          <radialGradient id={coreId} cx="38%" cy="32%" r="62%">
            <stop offset="0%" stopColor="#fff6e0" />
            <stop offset="42%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(251, 191, 36, 0.55)" />
            <stop offset="70%" stopColor="rgba(245, 158, 11, 0.12)" />
            <stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
          </radialGradient>
        </defs>
        <circle className="iskra-orb__halo" cx="24" cy="24" r="22" fill={`url(#${glowId})`} />
        <circle className="iskra-orb__core" cx="24" cy="24" r="11" fill={`url(#${coreId})`} />
        <circle className="iskra-orb__sheen" cx="20" cy="18" r="3.2" fill="rgba(255, 255, 255, 0.55)" />
      </svg>
    </Tag>
  )
}
