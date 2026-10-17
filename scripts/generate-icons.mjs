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

/**
 * PWA / системный splash: ровный тёмный холст + КРУПНЫЙ знак.
 * Размер знака ≈ первый кадр boot-зума в index.html — иначе видна
 * «статичная иконка», потом отдельная анимация с другим масштабом.
 * Без внутренней плитки. Фон = --premium-bg (#030806).
 */
function iconSvg(size) {
  const markBox = size * 0.82
  const mx = (size - markBox) / 2
  const my = (size - markBox) / 2
  const s = markBox / 32
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#030806"/>
  <g transform="translate(${mx} ${my}) scale(${s})" fill="#2effb8" color="#2effb8">${MARK_INNER.replaceAll('currentColor', '#2effb8')}</g>
</svg>
`.trim()
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

for (const s of sizes) {
  const out = path.join(outDir, `icon-${s}.png`)
  await sharp(Buffer.from(iconSvg(s))).png().toFile(out)
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

const master = path.join(brandDir, 'os-icon-1024.png')
await sharp(Buffer.from(iconSvg(1024))).png().toFile(master)

console.log(`Generated ${PRODUCT_BRAND_NAME} icons (ядро + орбиты) in`, outDir)
console.log('Master:', master)
