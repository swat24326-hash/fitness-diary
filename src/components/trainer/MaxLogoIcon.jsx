/**
 * Минималистичная иконка Max (кольцо с «хвостиком» как у логотипа).
 * @param {{ size?: number, className?: string, title?: string }} props
 */
export function MaxLogoIcon({ size = 22, className = '', title }) {
  const id = `max-grad-${String(size).replace('.', '')}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={id} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="0.55" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c026d3" />
        </linearGradient>
      </defs>
      {/* фон под «горящее» состояние — через currentColor / CSS fill */}
      <rect className="max-logo-icon__bg" x="1" y="1" width="30" height="30" rx="8" fill={`url(#${id})`} />
      {/* белое кольцо с хвостиком */}
      <path
        className="max-logo-icon__ring"
        fill="#fff"
        d="M16 7.2c-4.85 0-8.8 3.72-8.8 8.3 0 2.55 1.2 4.85 3.15 6.4-.15.95-.55 2.35-1.85 3.55 1.75-.2 3.2-.85 4.15-1.45 1.05.35 2.2.55 3.35.55 4.85 0 8.8-3.72 8.8-8.3S20.85 7.2 16 7.2zm0 2.4c3.45 0 6.25 2.6 6.25 5.9S19.45 21.4 16 21.4c-.95 0-1.85-.2-2.65-.55l-.55-.25-.5.35c-.35.25-.9.55-1.55.75.45-.75.7-1.45.8-1.9l.15-.65-.45-.5c-1.35-1.15-2.2-2.8-2.2-4.65 0-3.3 2.8-5.9 6.25-5.9z"
      />
    </svg>
  )
}
