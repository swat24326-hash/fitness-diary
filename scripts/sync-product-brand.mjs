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
const markInner = productBrandMarkInnerSvg().replaceAll('currentColor', '#2effb8')

const indexHtml = `<!DOCTYPE html>
<html lang="ru" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="${icon192}" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
    <script src="/manifest-boot.js"></script>
    <meta name="theme-color" content="#030806" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="${PRODUCT_BRAND_SHORT}" />
    <link rel="apple-touch-icon" href="${icon192}" />
    <title>${PRODUCT_BRAND_NAME}</title>
    <style>
      html, body { margin: 0; height: 100%; background: #030806; }
      #yadro-boot-splash {
        position: fixed; inset: 0; z-index: 9999;
        display: grid; place-items: center;
        background: #030806; pointer-events: none;
      }
      #yadro-boot-splash__mark {
        width: min(42vw, 168px); height: min(42vw, 168px);
        color: #2effb8;
        transform-origin: center;
        animation: yadro-boot-zoom 1.15s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      #yadro-boot-splash__mark svg { display: block; width: 100%; height: 100%; }
      @keyframes yadro-boot-zoom {
        0% { transform: scale(2.55); }
        70% { transform: scale(1.04); }
        100% { transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        #yadro-boot-splash__mark { animation: none; }
      }
    </style>
  </head>
  <body>
    <div id="yadro-boot-splash" data-started-at="" aria-hidden="true">
      <div id="yadro-boot-splash__mark">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
          ${markInner}
        </svg>
      </div>
    </div>
    <script>
      (function () {
        var el = document.getElementById('yadro-boot-splash');
        if (el) el.setAttribute('data-started-at', String(Date.now()));
      })();
    </script>
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
  theme_color: '#030806',
  background_color: '#030806',
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

const bootPath = path.join(root, 'public/manifest-boot.js')
const bootSrc = fs.readFileSync(bootPath, 'utf8')
const bootNext = bootSrc.replace(
  /\/manifest\.json\?v=\d+/,
  `/manifest.json?v=${PRODUCT_BRAND_ASSETS_VERSION}`,
)
if (bootNext !== bootSrc) {
  write('public/manifest-boot.js', bootNext)
} else {
  console.log('OK: public/manifest-boot.js (версия уже совпадает)')
}

console.log(`sync-product-brand: ${PRODUCT_BRAND_NAME} / ${PRODUCT_BRAND_LOCKUP} (${PRODUCT_BRAND_TAGLINE})`)
