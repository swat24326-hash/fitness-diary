/**
 * Точка входа portable host: API + статика dist.
 * Usage: npm run build && npm start
 * Env: PORT (default 8080), HOST, STATIC_DIR, плюс те же SUPABASE_* что на Vercel.
 */
import { createPortableApiHost } from './portableApiHost.js'

const host = createPortableApiHost()

host
  .listen()
  .then(() => {
    console.log(`[portable-api] http://${host.host === '0.0.0.0' ? 'localhost' : host.host}:${host.port}`)
    console.log(`[portable-api] static: ${host.distDir}`)
  })
  .catch((err) => {
    console.error('[portable-api] failed to listen', err)
    process.exit(1)
  })
