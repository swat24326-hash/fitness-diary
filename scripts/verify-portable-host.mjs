/**
 * Smoke portable host: health JSON без Vite/dist.
 * node scripts/verify-portable-host.mjs
 */
import { createPortableApiHost } from '../server/portableApiHost.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const host = createPortableApiHost({ port: 0, host: '127.0.0.1' })
const server = await host.listen()
const addr = server.address()
const port = typeof addr === 'object' && addr ? addr.port : 0
ok(port > 0, 'server listens on ephemeral port')

try {
  const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`)
  const health = await healthRes.json()
  ok(healthRes.status === 200, 'GET /api/health → 200')
  ok(health?.ok === true, 'health.ok')
  ok(health?.service === 'portable-api', 'health.service')

  const altRes = await fetch(`http://127.0.0.1:${port}/health`)
  const alt = await altRes.json()
  ok(altRes.status === 200 && alt?.ok === true, 'GET /health → 200')

  const missing = await fetch(`http://127.0.0.1:${port}/api/___no_such_handler___`)
  ok(missing.status === 404, 'unknown api → 404')

  const authOff = await fetch(`http://127.0.0.1:${port}/auth/v1/token`, { method: 'POST' })
  ok(authOff.status === 404, 'GET-less /auth/v1 закрыт, пока AUTH_PROVIDER не own')

  const restOff = await fetch(`http://127.0.0.1:${port}/rest/v1/clients?select=id`)
  ok(restOff.status === 404, '/rest/v1 закрыт, пока нет AUTH_PROVIDER=own и DATA_BACKEND=pg')
  const restPreflight = await fetch(`http://127.0.0.1:${port}/rest/v1/clients`, { method: 'OPTIONS' })
  ok(
    restPreflight.status === 204 && /prefer/.test(restPreflight.headers.get('access-control-allow-headers') || ''),
    '/rest/v1 OPTIONS отдаёт CORS с prefer',
  )
} finally {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

if (failed) process.exit(1)
console.log('verify-portable-host: all passed')
