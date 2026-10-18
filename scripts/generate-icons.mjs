import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { PRODUCT_BRAND_NAME } from '../src/lib/productBrand.js'
import { productBrandMarkInnerSvg } from '../src/lib/productBrandMark.js'

const outDir = path.resolve('public', 'icons')
const brandDir = path.resolve('public', 'brand')
await fs.mkdir(outDir, { recursive: true })
await fs.mkdir(brandDir, { recursive: true })

const MARK_INNER = productBrandMarkInnerSvg()

function markGroup(size, markFrac) {
  const markBox = size * markFrac
  const mx = (size - markBox) / 2
  const my = (size - markBox) / 2
  const s = markBox / 32
  return `<g transform="translate(${mx} ${my}) scale(${s})" fill="#2effb8" color="#2effb8">${MARK_INNER.replaceAll('currentColor', '#2effb8')}</g>`
}

/**
 * Splash / purpose «any»: только знак, без фона (прозрачный PNG).
 * Android рисует background_color манифеста (#000) — без серой «плитки» вокруг логотипа (как у VK).
 */
function iconAnySvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${markGroup(size, 0.82)}
</svg>
`.trim()
}

/**
 * Домашний экран / purpose «maskable»: чёрный холст + знак (адаптивная иконка).
 */
function iconMaskableSvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#000000"/>
  ${markGroup(size, 0.72)}
</svg>
`.trim()
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

for (const s of sizes) {
  await sharp(Buffer.from(iconAnySvg(s))).png().toFile(path.join(outDir, `icon-${s}.png`))
  await sharp(Buffer.from(iconMaskableSvg(s))).png().toFile(path.join(outDir, `icon-${s}-maskable.png`))
}

/** Значок push в строке состояния Android: система берёт только прозрачность, поэтому без фона — иначе белый квадрат. */
function badgeSvg(size) {
  const markBox = size * 0.84
  const m = (size - markBox) / 2
  const s = markBox / 32
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${m} ${m}) scale(${s})" fill="#ffffff" color="#ffffff">${MARK_INNER.replaceAll('currentColor', '#ffffff')}</g>
</svg>
`.trim()
}

await sharp(Buffer.from(badgeSvg(96))).png().toFile(path.join(outDir, 'badge-96.png'))

/**
 * Картинка push в шторке (Web Notification `icon`): чёрный холст + знак.
 * Не путать с `icon-192.png` (purpose any, прозрачный splash) — на светлой карточке
 * Android/Chrome рисует «голый» знак крупно и он выглядит коряво.
 */
await sharp(Buffer.from(iconMaskableSvg(192))).png().toFile(path.join(outDir, 'push-192.png'))

const master = path.join(brandDir, 'os-icon-1024.png')
await sharp(Buffer.from(iconMaskableSvg(1024))).png().toFile(master)

console.log(`Generated ${PRODUCT_BRAND_NAME} icons (any=прозрачный splash, maskable=чёрный, push-192) in`, outDir)
console.log('Master:', master)
