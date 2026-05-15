import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const outDir = path.resolve('public', 'icons')
await fs.mkdir(outDir, { recursive: true })

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0a0a0a"/>
  <rect x="${Math.round(size * 0.12)}" y="${Math.round(size * 0.12)}" width="${Math.round(size * 0.76)}" height="${Math.round(
  size * 0.76,
)}" rx="${Math.round(size * 0.18)}" fill="#00d4ff"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif"
        font-size="${Math.round(size * 0.52)}" font-weight="900" fill="#0a0a0a">F</text>
</svg>
`.trim()

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

for (const s of sizes) {
  const out = path.join(outDir, `icon-${s}.png`)
  await sharp(Buffer.from(svg(s))).png().toFile(out)
}

console.log('Generated icons in', outDir)

