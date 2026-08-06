/**
 * Синхронизация статики с src/lib/productBrand.js.
 * Запуск: npm run sync:brand
 * После смены имени: sync:brand → gen:icons → verify-product-brand.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const brandUrl = pathToFileURL(path.join(root, 'src/lib/productBrand.js')).href
const brand = await import(brandUrl)
const { productBrandMarkFileSvg, productBrandMarkInnerSvg } = await import(
  pathToFileURL(path.join(root, 'src/lib/productBrandMark.js')).href
)

const {
  PRODUCT_BRAND_NAME,
  PRODUCT_BRAND_SHORT,
  PRODUCT_BRAND_LOCKUP,
  PRODUCT_BRAND_PWA_DESCRIPTION,
  PRODUCT_BRAND_TAGLINE,
  PRODUCT_BRAND_ASSETS_VERSION,
  productBrandIconPath,
} = brand

function write(rel, content) {
  const abs = path.join(root, rel)
  fs.writeFileSync(abs, content, 'utf8')
  console.log('OK:', rel)
}

const icon192 = productBrandIconPath(192)

const indexHtml = `<!DOCTYPE html>
<html lang="ru" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="${icon192}" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <link rel="manifest" href="/manifest.json?v=${PRODUCT_BRAND_ASSETS_VERSION}" />
    <meta name="theme-color" content="#070908" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="${PRODUCT_BRAND_SHORT}" />
    <link rel="apple-touch-icon" href="${icon192}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
    <title>${PRODUCT_BRAND_NAME}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`

write('index.html', indexHtml)

const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512]
const manifest = {
  name: PRODUCT_BRAND_NAME,
  short_name: PRODUCT_BRAND_SHORT,
  description: PRODUCT_BRAND_PWA_DESCRIPTION,
  start_url: '/',
  display: 'standalone',
  theme_color: '#0a0a0a',
  background_color: '#0a0a0a',
  orientation: 'portrait',
  icons: iconSizes.map((size) => ({
    src: productBrandIconPath(size),
    sizes: `${size}x${size}`,
    type: 'image/png',
  })),
}
write('public/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)

const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 120" fill="#111111" role="img" aria-label="${PRODUCT_BRAND_NAME}">
  <title>${PRODUCT_BRAND_NAME}</title>
  <g transform="translate(12, 28) scale(2)" fill="#111111">
    ${productBrandMarkInnerSvg().replaceAll('currentColor', '#111111')}
  </g>
  <text x="92" y="82" font-family="Arial Narrow, Arial, Helvetica, sans-serif" font-size="64" font-weight="800" letter-spacing="6">${PRODUCT_BRAND_LOCKUP}</text>
</svg>
`
write('public/brand/os-lockup.svg', lockup)

write('public/brand/os-mark.svg', productBrandMarkFileSvg({ title: PRODUCT_BRAND_NAME }))

console.log(`sync-product-brand: ${PRODUCT_BRAND_NAME} / ${PRODUCT_BRAND_LOCKUP} (${PRODUCT_BRAND_TAGLINE})`)
