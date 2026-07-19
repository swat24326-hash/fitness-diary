import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const outDir = path.resolve('public', 'icons')
const brandDir = path.resolve('public', 'brand')
await fs.mkdir(outDir, { recursive: true })
await fs.mkdir(brandDir, { recursive: true })

const MARK_PATHS = `
  <path d="M2 7.5L11 16L2 24.5L5.8 24.5L14.8 16L5.8 7.5Z"/>
  <path d="M10.5 7.5L19.5 16L10.5 24.5L14.3 24.5L23.3 16L14.3 7.5Z"/>
  <path d="M19 7.5L28 16L19 24.5L22.8 24.5L31.8 16L22.8 7.5Z"/>
`

/** PWA: тёмный canvas + шевроны Порыва + ОСЬ */
function iconSvg(size) {
  const pad = size * 0.14
  const markBox = size * 0.42
  const mx = (size - markBox) / 2
  const my = size < 192 ? (size - markBox) / 2 : size * 0.14
  const s = markBox / 32
  const word =
    size >= 192
      ? `<text x="50%" y="${Math.round(size * 0.84)}" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial Narrow,Arial,sans-serif"
        font-size="${Math.round(size * 0.12)}" font-weight="800" fill="#e8f5ef" letter-spacing="${Math.max(2, size * 0.02)}">ОСЬ</text>`
      : ''
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#070b09"/>
  <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}"
        rx="${size * 0.06}" fill="#0c1410"/>
  <g transform="translate(${mx} ${my}) scale(${s})" fill="#2effb8">${MARK_PATHS}</g>
  ${word}
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

console.log('Generated Ось icons (шевроны Порыва) in', outDir)
console.log('Master:', master)
