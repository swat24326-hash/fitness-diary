/**
 * Печатный QR-макет Ядра → рабочий стол.
 * Ссылка: https://app-core.ru
 */
import QRCode from 'qrcode'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const URL = 'https://app-core.ru'
const desktop = path.join(os.homedir(), 'OneDrive', 'Desktop')
const outPng = path.join(desktop, 'Ядро — QR app-core.ru.png')
const outSvg = path.join(desktop, 'Ядро — QR app-core.ru.svg')

const W = 2480
const H = 3508

const qrBuf = await QRCode.toBuffer(URL, {
  type: 'png',
  width: 1280,
  margin: 2,
  errorCorrectionLevel: 'H',
  color: { dark: '#030806', light: '#FFFFFF' },
})

const markRaw = fs
  .readFileSync(path.join(root, 'public', 'brand', 'os-mark.svg'), 'utf8')
  .replaceAll('#111111', '#2effb8')

const markPng = await sharp(Buffer.from(markRaw))
  .resize(220, 220, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="50%" cy="26%" r="58%">
      <stop offset="0%" stop-color="#2effb8" stop-opacity="0.20"/>
      <stop offset="55%" stop-color="#14d89a" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#030806" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="50%" cy="78%" r="42%">
      <stop offset="0%" stop-color="#2effb8" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#030806" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#030806"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>
  <rect x="96" y="96" width="${W - 192}" height="${H - 192}" rx="56" fill="none" stroke="rgba(46,255,184,0.28)" stroke-width="3"/>
</svg>`

const titleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="420" viewBox="0 0 ${W} 420">
  <text x="${W / 2}" y="170" text-anchor="middle" font-family="Arial Narrow, Arial, Helvetica, sans-serif" font-size="128" font-weight="800" letter-spacing="20" fill="#f6f4ef">ЯДРО</text>
  <text x="${W / 2}" y="250" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="500" letter-spacing="3" fill="#a8b2ac">Операционная система фитнес-клуба</text>
</svg>`

const footerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="520" viewBox="0 0 ${W} 520">
  <text x="${W / 2}" y="80" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="600" fill="#f6f4ef">Отсканируйте камерой телефона</text>
  <text x="${W / 2}" y="180" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" letter-spacing="2" fill="#2effb8">app-core.ru</text>
  <text x="${W / 2}" y="280" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="500" fill="#a8b2ac">Откройте сайт Ядра — вход в клуб одной ссылкой</text>
  <text x="${W / 2}" y="400" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="rgba(168,178,172,0.65)">https://app-core.ru</text>
</svg>`

const cardW = 1560
const cardH = 1560
const cardX = Math.round((W - cardW) / 2)
const cardY = 980
const qrSize = 1280
const qrX = Math.round((W - qrSize) / 2)
const qrY = cardY + Math.round((cardH - qrSize) / 2)

const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}">
  <rect width="${cardW}" height="${cardH}" rx="48" fill="rgba(8,32,24,0.72)" stroke="rgba(46,255,184,0.28)" stroke-width="4"/>
  <rect x="70" y="70" width="${cardW - 140}" height="${cardH - 140}" rx="32" fill="#ffffff"/>
</svg>`

const bgPng = await sharp(Buffer.from(bgSvg)).resize(W, H).png().toBuffer()
const cardPng = await sharp(Buffer.from(cardSvg)).resize(cardW, cardH).png().toBuffer()
const titlePng = await sharp(Buffer.from(titleSvg)).resize(W, 420).png().toBuffer()
const footerPng = await sharp(Buffer.from(footerSvg)).resize(W, 520).png().toBuffer()
const qrPng = await sharp(qrBuf).resize(qrSize, qrSize).png().toBuffer()

await sharp(bgPng)
  .composite([
    { input: markPng, left: Math.round((W - 220) / 2), top: 280 },
    { input: titlePng, left: 0, top: 500 },
    { input: cardPng, left: cardX, top: cardY },
    { input: qrPng, left: qrX, top: qrY },
    { input: footerPng, left: 0, top: 2650 },
  ])
  .png({ compressionLevel: 8 })
  .toFile(outPng)

const printSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="50%" cy="26%" r="58%">
      <stop offset="0%" stop-color="#2effb8" stop-opacity="0.20"/>
      <stop offset="55%" stop-color="#14d89a" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#030806" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#030806"/>
  <rect width="100%" height="100%" fill="url(#g1)"/>
  <rect x="96" y="96" width="${W - 192}" height="${H - 192}" rx="56" fill="none" stroke="rgba(46,255,184,0.28)" stroke-width="3"/>
  <image x="${(W - 220) / 2}" y="280" width="220" height="220" href="data:image/png;base64,${markPng.toString('base64')}"/>
  <text x="${W / 2}" y="670" text-anchor="middle" font-family="Arial Narrow, Arial, Helvetica, sans-serif" font-size="128" font-weight="800" letter-spacing="20" fill="#f6f4ef">ЯДРО</text>
  <text x="${W / 2}" y="750" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="500" letter-spacing="3" fill="#a8b2ac">Операционная система фитнес-клуба</text>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="48" fill="rgba(8,32,24,0.72)" stroke="rgba(46,255,184,0.28)" stroke-width="4"/>
  <rect x="${cardX + 70}" y="${cardY + 70}" width="${cardW - 140}" height="${cardH - 140}" rx="32" fill="#ffffff"/>
  <image x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" href="data:image/png;base64,${qrBuf.toString('base64')}"/>
  <text x="${W / 2}" y="2730" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="600" fill="#f6f4ef">Отсканируйте камерой телефона</text>
  <text x="${W / 2}" y="2830" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" fill="#2effb8">app-core.ru</text>
  <text x="${W / 2}" y="2930" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="#a8b2ac">Откройте сайт Ядра — вход в клуб одной ссылкой</text>
  <text x="${W / 2}" y="3080" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="rgba(168,178,172,0.65)">https://app-core.ru</text>
</svg>`

fs.writeFileSync(outSvg, printSvg, 'utf8')
const meta = await sharp(outPng).metadata()
console.log('PNG', outPng, `${meta.width}x${meta.height}`, fs.statSync(outPng).size)
console.log('SVG', outSvg, fs.statSync(outSvg).size)
