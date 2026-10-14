/**
 * Свой сервер (C2): то, что на Vercel даёт платформа — лимит тела и заголовки безопасности.
 */
import { Readable } from 'node:stream'
import {
  PORTABLE_BINARY_APIS,
  PORTABLE_MAX_BODY_BYTES_DEFAULT,
  PORTABLE_MAX_UPLOAD_BYTES_DEFAULT,
  portableBodyPolicy,
  portableMaxBodyBytes,
  readBodyLimited,
} from '../api/_lib/portableHostSecurityCore.js'
import { createPortableApiHost } from '../server/portableApiHost.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

console.log('body limit')
ok(PORTABLE_MAX_BODY_BYTES_DEFAULT === 5 * 1024 * 1024, 'по умолчанию 5 МБ (Vercel режет 4,5 — рабочие пакеты Sync меньше)')
ok(portableMaxBodyBytes('') === PORTABLE_MAX_BODY_BYTES_DEFAULT, 'пустой env — по умолчанию')
ok(portableMaxBodyBytes('abc') === PORTABLE_MAX_BODY_BYTES_DEFAULT, 'мусор в env — по умолчанию')
ok(portableMaxBodyBytes('10485760') === 10485760, 'env задаёт лимит')
const json = portableBodyPolicy('application/json; charset=utf-8')
ok(!json.binary && json.limit === PORTABLE_MAX_BODY_BYTES_DEFAULT, 'JSON и Sync — текстом, 5 МБ')
const mp4 = portableBodyPolicy('video/mp4')
ok(mp4.binary && mp4.limit === PORTABLE_MAX_UPLOAD_BYTES_DEFAULT, 'видеокружок MP4 — байтами, 15 МБ')
ok(PORTABLE_MAX_UPLOAD_BYTES_DEFAULT === 15 * 1024 * 1024, 'лимит байтов 15 МБ — минута кружка 640 px с запасом')
ok(portableBodyPolicy('Video/WebM; codecs=vp9').binary, 'WebM с кодеком — тоже байтами')
ok(!portableBodyPolicy('application/octet-stream').binary && !portableBodyPolicy('image/png').binary, 'прочие типы — не байтами, лимит не растёт')
ok(portableBodyPolicy('video/mp4', { MAX_UPLOAD_BYTES: '2048' }).limit === 2048, 'env MAX_UPLOAD_BYTES задаёт лимит видео')
ok(portableBodyPolicy('video/mp4', { MAX_UPLOAD_BYTES: 'x' }).limit === PORTABLE_MAX_UPLOAD_BYTES_DEFAULT, 'мусор в env — 15 МБ')
ok(
  [...PORTABLE_BINARY_APIS].sort().join() === 'admin-data,client-me,coach',
  'байты принимают только входные точки переписки (Sync, вход, push — нет)',
)
const small = await readBodyLimited(Readable.from([Buffer.from('ab'), Buffer.from('c')]), 10)
ok(small.ok && small.raw.toString() === 'abc', 'малое тело читается целиком')
const big = await readBodyLimited(Readable.from([Buffer.alloc(6), Buffer.alloc(6)]), 10)
ok(!big.ok, 'тело больше лимита — отказ')

console.log('server')
const host = createPortableApiHost({ port: 0, host: '127.0.0.1', distDir: 'dist' })
const server = await host.listen()
const base = `http://127.0.0.1:${server.address().port}`
try {
  const health = await fetch(`${base}/health`)
  ok(health.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff')
  ok(health.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY (кликджекинг)')
  ok(Boolean(health.headers.get('strict-transport-security')), 'HSTS')
  ok(Boolean(health.headers.get('referrer-policy')), 'Referrer-Policy')
  const csp = health.headers.get('content-security-policy') ?? ''
  ok(/default-src 'self'/.test(csp), 'CSP боевой')
  ok(!health.headers.get('content-security-policy-report-only'), 'report-only выключен (не дублируем)')
  ok(/(^|; )script-src ([^;]*)/.exec(csp)?.[2] === "'self'", 'script-src только свой — без unsafe-eval / unsafe-inline')
  ok(/media-src [^;]*blob:[^;]*https:/.test(csp), 'CSP media-src: голос ИСКРЫ (blob:) и записи звонков (https)')
  ok(/frame-src [^;]*blob:/.test(csp), 'CSP frame-src blob: — печать прайса')
  ok(/font-src 'self' data:;/.test(csp), 'CSP font-src без внешних доменов — Inter свой')
  ok(!health.headers.get('permissions-policy'), 'Permissions-Policy не режет Web Bluetooth пульсометров')

  const huge = await fetch(`${base}/rest/v1/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'x'.repeat(PORTABLE_MAX_BODY_BYTES_DEFAULT + 1024),
  })
  ok(huge.status === 413, `тело > лимита → 413 (было ${huge.status})`)
  const hugeBody = await huge.json().catch(() => ({}))
  ok(/Слишком большой/.test(String(hugeBody.error ?? '')), 'понятная ошибка на русском')
  const restVideo = await fetch(`${base}/rest/v1/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4' },
    body: Buffer.alloc(PORTABLE_MAX_BODY_BYTES_DEFAULT + 1024),
  })
  ok(restVideo.status === 413, `видео-тип мимо /api/* — прежний лимит 5 МБ (было ${restVideo.status})`)
  const syncVideo = await fetch(`${base}/api/push-records`, {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4' },
    body: Buffer.alloc(PORTABLE_MAX_BODY_BYTES_DEFAULT + 1024),
  })
  ok(syncVideo.status === 413, `видео-тип в /api/push-records — прежний лимит 5 МБ (было ${syncVideo.status})`)
} finally {
  await new Promise((r) => server.close(r))
}

if (failed) {
  console.error(`\nverify-portable-host-security: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-portable-host-security: ok')
