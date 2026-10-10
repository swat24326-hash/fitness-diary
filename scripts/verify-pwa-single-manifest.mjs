/**
 * В index.html после сборки ровно одна ссылка на manifest — та, что подменяет /me (manifest клуба, вход значка на iPhone).
 * vite-plugin-pwa дописывает вторую /manifest.json со стартом «/»: значок клиента на iPhone открывал вход зала.
 * node scripts/verify-pwa-single-manifest.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { countManifestLinks, keepFirstManifestLink } from '../src/lib/pwaHtmlCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const built = `<head>
    <link rel="manifest" href="/manifest.json?v=3" />
    <meta name="theme-color" content="#070908" />
    <link rel="stylesheet" crossorigin href="/assets/index.css">
  <link rel="manifest" href="/manifest.json"></head>`
const fixed = keepFirstManifestLink(built)
ok(countManifestLinks(built) === 2, 'сборка без правки: две ссылки на manifest (как было на проде)')
ok(countManifestLinks(fixed) === 1, 'после правки — одна ссылка')
ok(fixed.includes('href="/manifest.json?v=3"'), 'остаётся первая — /manifest.json?v=3 (её подменяет /me)')
ok(fixed.includes('<link rel="stylesheet"'), 'остальной head не тронут')
ok(keepFirstManifestLink('<head></head>') === '<head></head>', 'без manifest — HTML как был')
ok(countManifestLinks(keepFirstManifestLink(`<LINK REL='manifest' href="/a"><link href="/b" rel="manifest">`)) === 1, 'регистр и порядок атрибутов')

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
ok(countManifestLinks(src) === 1, 'index.html: одна ссылка на manifest')

const config = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
const pwaAt = config.indexOf('VitePWA(')
const fixAt = config.indexOf("name: 'fitness-diary-single-manifest'")
ok(pwaAt > 0 && fixAt > pwaAt, 'vite.config: чистка дубля стоит после VitePWA (иначе плагин допишет ссылку позже)')
ok(
  /name: 'fitness-diary-single-manifest',\s*enforce: 'post',\s*transformIndexHtml: \{ order: 'post'/.test(config),
  "vite.config: чистка — enforce и order 'post' (VitePWA сам enforce: 'post')",
)

const dist = new URL('../dist/index.html', import.meta.url)
if (existsSync(dist)) ok(countManifestLinks(readFileSync(dist, 'utf8')) === 1, 'dist/index.html: одна ссылка на manifest')

if (failed) {
  console.error(`\nverify-pwa-single-manifest: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-pwa-single-manifest: OK')
