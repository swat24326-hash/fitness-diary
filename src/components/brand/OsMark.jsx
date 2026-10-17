import { PRODUCT_BRAND_LOCKUP, PRODUCT_BRAND_NAME } from '../../lib/productBrand.js'
import { PRODUCT_BRAND_MARK_VIEWBOX } from '../../lib/productBrandMark.js'

/**
 * Знак продукта: ядро и орбиты (канон Ядро).
 * Плоская геометрия; цвет — currentColor / accent роли.
 * Классы os-mark__* — для анимации splash (вращение орбит).
 */
export function OsMark({ size = 28, className = '', title } = {}) {
  const label = title || PRODUCT_BRAND_NAME
  return (
    <svg
      className={`os-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox={PRODUCT_BRAND_MARK_VIEWBOX}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{label}</title> : null}
      <g fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="butt">
        <g className="os-mark__orbit-spin os-mark__orbit-spin--outer">
          <circle
            className="os-mark__orbit os-mark__orbit--outer"
            cx="16"
            cy="16"
            r="13"
            pathLength="100"
            strokeDasharray="36 14 36 14"
            transform="rotate(48 16 16)"
          />
        </g>
        <g className="os-mark__orbit-spin os-mark__orbit-spin--inner">
          <circle
            className="os-mark__orbit os-mark__orbit--inner"
            cx="16"
            cy="16"
            r="8.2"
            pathLength="100"
            strokeDasharray="78 22"
            transform="rotate(-32 16 16)"
          />
        </g>
      </g>
      <circle className="os-mark__core" cx="16" cy="16" r="3.9" fill="currentColor" />
      <circle className="os-mark__sat os-mark__sat--a" cx="22.05" cy="10.05" r="2.05" fill="currentColor" />
      <circle className="os-mark__sat os-mark__sat--b" cx="7.05" cy="7.35" r="2.05" fill="currentColor" />
      <circle className="os-mark__sat os-mark__sat--c" cx="16" cy="29.05" r="2.05" fill="currentColor" />
    </svg>
  )
}

/** Полный логотип: знак + wordmark из PRODUCT_BRAND_LOCKUP */
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
