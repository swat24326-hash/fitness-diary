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

/** PWA: тёмный canvas + знак по центру, без надписи — подпись под значком телефон берёт из названия приложения (клуб). */
function iconSvg(size) {
  const pad = size * 0.14
  const markBox = size * 0.5
  const mx = (size - markBox) / 2
  const my = (size - markBox) / 2
  const s = markBox / 32
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#070b09"/>
  <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}"
        rx="${size * 0.06}" fill="#0c1410"/>
  <g transform="translate(${mx} ${my}) scale(${s})" fill="#2effb8" color="#2effb8">${MARK_INNER.replaceAll('currentColor', '#2effb8')}</g>
</svg>
`.trim()
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

for (const s of sizes) {
  const out = path.join(outDir, `icon-${s}.png`)
  await sharp(Buffer.from(iconSvg(s))).png().toFile(out)
}

const master = path.join(brandDir, 'os-icon-1024.png')
await sharp(Buffer.from(iconSvg(1024))).png().toFile(master)

console.log(`Generated ${PRODUCT_BRAND_NAME} icons (ядро + орбиты) in`, outDir)
console.log('Master:', master)
