import { PRODUCT_BRAND_LOCKUP, PRODUCT_BRAND_NAME } from '../../lib/productBrand.js'

/**
 * Знак Ось: три шеврона «вперёд» (марка от Порыва).
 * Плоская геометрия в духе Лебедева. Цвет — currentColor / accent роли.
 */
export function OsMark({ size = 28, className = '', title } = {}) {
  const label = title || PRODUCT_BRAND_NAME
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{label}</title> : null}
      <path d="M2 7.5L11 16L2 24.5L5.8 24.5L14.8 16L5.8 7.5Z" />
      <path d="M10.5 7.5L19.5 16L10.5 24.5L14.3 24.5L23.3 16L14.3 7.5Z" />
      <path d="M19 7.5L28 16L19 24.5L22.8 24.5L31.8 16L22.8 7.5Z" />
    </svg>
  )
}

/** Полный блок: шевроны + wordmark ОСЬ */
export function OsWordmark({
  markSize = 28,
  className = '',
  markClassName = '',
  textClassName = '',
  showText = true,
} = {}) {
  return (
    <span className={`os-wordmark ${className}`.trim()}>
      <span className={`os-wordmark__mark ${markClassName}`.trim()}>
        <OsMark size={markSize} />
      </span>
      {showText ? (
        <span className={`os-wordmark__text ${textClassName}`.trim()}>{PRODUCT_BRAND_LOCKUP}</span>
      ) : null}
    </span>
  )
}
