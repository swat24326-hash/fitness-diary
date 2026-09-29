/**
 * Свой сервер (C2): то, что на Vercel даёт платформа — лимит тела и заголовки безопасности.
 */
import { Readable } from 'node:stream'
import {
  PORTABLE_MAX_BODY_BYTES_DEFAULT,
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
  const csp = health.headers.get('content-security-policy-report-only') ?? ''
  ok(/default-src 'self'/.test(csp), 'CSP пока report-only (PWA не ломаем)')
  ok(!health.headers.get('content-security-policy'), 'боевой CSP не включён')
  ok(!health.headers.get('permissions-policy'), 'Permissions-Policy не режет Web Bluetooth пульсометров')

  const huge = await fetch(`${base}/rest/v1/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'x'.repeat(PORTABLE_MAX_BODY_BYTES_DEFAULT + 1024),
  })
  ok(huge.status === 413, `тело > лимита → 413 (было ${huge.status})`)
  const hugeBody = await huge.json().catch(() => ({}))
  ok(/Слишком большой/.test(String(hugeBody.error ?? '')), 'понятная ошибка на русском')
} finally {
  await new Promise((r) => server.close(r))
}

if (failed) {
  console.error(`\nverify-portable-host-security: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-portable-host-security: ok')
