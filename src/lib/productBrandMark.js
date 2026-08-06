/**
 * Геометрия знака продукта «Ядро» (ядро + орбиты).
 * Один источник для React, sync:brand и gen:icons.
 * viewBox: 0 0 32 32. Цвет — currentColor / fill родителя.
 */

export const PRODUCT_BRAND_MARK_VIEWBOX = '0 0 32 32'

/** Внутренность SVG (без корневого <svg>). */
export function productBrandMarkInnerSvg() {
  return `
  <g fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="butt">
    <circle cx="16" cy="16" r="13" pathLength="100" stroke-dasharray="36 14 36 14" transform="rotate(48 16 16)"/>
    <circle cx="16" cy="16" r="8.2" pathLength="100" stroke-dasharray="78 22" transform="rotate(-32 16 16)"/>
  </g>
  <circle cx="16" cy="16" r="3.9" fill="currentColor"/>
  <circle cx="22.05" cy="10.05" r="2.05" fill="currentColor"/>
  <circle cx="7.05" cy="7.35" r="2.05" fill="currentColor"/>
  <circle cx="16" cy="29.05" r="2.05" fill="currentColor"/>
`.trim()
}

/** Полный SVG-файл знака (статический, fill #111). */
export function productBrandMarkFileSvg({ title = '' } = {}) {
  const titleBlock = title ? `\n  <title>${escapeXml(title)}</title>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PRODUCT_BRAND_MARK_VIEWBOX}" fill="#111111" aria-hidden="${title ? 'false' : 'true'}">${titleBlock}
  ${productBrandMarkInnerSvg().replaceAll('currentColor', '#111111')}
</svg>
`
}

function escapeXml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
