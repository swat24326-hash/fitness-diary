/**
 * Manifest зала — только из public/manifest-boot.js и не на /me (INC-2026-10-10-01): iPhone запоминает для значка
 * manifest с загрузки страницы; manifest зала (start_url «/») открывал клиенту вход сотрудника.
 * В собранном index.html статичных ссылок на manifest нет (vite-plugin-pwa дописывает свою — убираем).
 * node scripts/verify-pwa-single-manifest.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import vm from 'node:vm'
import { countManifestLinks, dropManifestLinks } from '../src/lib/pwaHtmlCore.js'

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
    <script src="/manifest-boot.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index.css">
  <link rel="manifest" href="/manifest.json"></head>`
const fixed = dropManifestLinks(built)
ok(countManifestLinks(built) === 1, 'vite-plugin-pwa дописывает ссылку на manifest')
ok(countManifestLinks(fixed) === 0, 'после чистки — ни одной статичной ссылки')
ok(fixed.includes('<link rel="stylesheet"') && fixed.includes('manifest-boot.js'), 'остальной head не тронут')
ok(countManifestLinks(dropManifestLinks(`<LINK REL='manifest' href="/a"><link href="/b" rel="manifest">`)) === 0, 'регистр и порядок атрибутов')

const bootSrc = readFileSync(new URL('../public/manifest-boot.js', import.meta.url), 'utf8')
function bootLinks(pathname) {
  const head = []
  const document = { head: { appendChild: (el) => head.push(el) }, createElement: () => ({}) }
  vm.runInNewContext(bootSrc, { document, location: { pathname } })
  return head.filter((el) => el.rel === 'manifest').map((el) => el.href)
}
for (const p of ['/', '/login', '/trainer', '/admin/clients', '/media']) {
  const links = bootLinks(p)
  ok(links.length === 1 && links[0] === '/manifest.json?v=3', `${p}: manifest зала /manifest.json?v=3`)
}
for (const p of ['/me', '/me/', '/me/join', '/me/settings']) {
  ok(bootLinks(p).length === 0, `${p}: manifest зала не ставим`)
}

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
ok(countManifestLinks(src) === 0, 'index.html: без статичной ссылки на manifest')
const bootAt = src.indexOf('<script src="/manifest-boot.js"></script>')
ok(bootAt > 0 && bootAt < src.indexOf('</head>'), 'index.html: manifest-boot.js — обычный скрипт в head (до загрузки приложения)')

const config = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
const pwaAt = config.indexOf('VitePWA(')
const fixAt = config.indexOf("name: 'fitness-diary-no-static-manifest'")
ok(pwaAt > 0 && fixAt > pwaAt, 'vite.config: чистка стоит после VitePWA')
ok(
  /name: 'fitness-diary-no-static-manifest',\s*enforce: 'post',\s*transformIndexHtml: \{ order: 'post'/.test(config),
  "vite.config: чистка — enforce и order 'post' (VitePWA сам enforce: 'post')",
)

const brandingSrc = readFileSync(new URL('../src/pages/client/useClientBranding.js', import.meta.url), 'utf8')
ok(/createElement\('link'\)/.test(brandingSrc), '/me сам добавляет manifest клуба (ссылки зала на /me нет)')
ok(
  /function setManifest\(href\) \{\s*if \(isIosUserAgent\(navigator\.userAgent, navigator\.maxTouchPoints\)\) return/.test(brandingSrc),
  'iPhone: /me без manifest — значок берёт текущий адрес /me?h=…',
)

const dist = new URL('../dist/', import.meta.url)
if (existsSync(new URL('index.html', dist))) {
  const html = readFileSync(new URL('index.html', dist), 'utf8')
  ok(countManifestLinks(html) === 0, 'dist/index.html: без статичной ссылки на manifest')
  ok(html.includes('<script src="/manifest-boot.js"></script>'), 'dist/index.html: manifest-boot.js на месте')
  ok(existsSync(new URL('manifest-boot.js', dist)), 'dist/manifest-boot.js собран')
  const sw = existsSync(new URL('sw.js', dist)) ? readFileSync(new URL('sw.js', dist), 'utf8') : ''
  ok(sw.includes('manifest-boot.js'), 'sw.js: manifest-boot.js в precache (офлайн-запуск)')
}

if (failed) {
  console.error(`\nverify-pwa-single-manifest: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-pwa-single-manifest: OK')
