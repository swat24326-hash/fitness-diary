/**
 * Портативный хост /api/* + статика dist (без Vercel runtime).
 * Прод клуба пока на Vercel; этот сервер — для стенда C2 / локальной проверки.
 */
import { createServer } from 'node:http'
import { stat } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { classifyServiceRoleKeyShape } from '../api/_lib/authCallerProfileCore.js'
import { handleAuthV1 } from '../api/_lib/authV1Handler.js'
import { handleRestV1 } from '../api/_lib/restV1Handler.js'
import {
  PAYLOAD_TOO_LARGE_RU,
  PORTABLE_SECURITY_HEADERS,
  portableMaxBodyBytes,
  readBodyLimited,
} from '../api/_lib/portableHostSecurityCore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const API_DIR = join(REPO_ROOT, 'api')
const DEFAULT_DIST = join(REPO_ROOT, 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
}

/** @type {Map<string, (req: object, res: import('node:http').ServerResponse) => Promise<void>|void>} */
const handlerCache = new Map()

class PayloadTooLargeError extends Error {}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<{ method: string, url: string, headers: object, body: unknown, query: Record<string, string | string[]> }>}
 */
async function normalizeRequest(req) {
  const host = req.headers.host || 'localhost'
  const rawUrl = req.url || '/'
  const u = new URL(rawUrl, `http://${host}`)
  /** @type {Record<string, string | string[]>} */
  const query = {}
  for (const [key, value] of u.searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const prev = query[key]
      query[key] = Array.isArray(prev) ? [...prev, value] : [String(prev), value]
    } else {
      query[key] = value
    }
  }

  const read = await readBodyLimited(req, portableMaxBodyBytes(process.env.MAX_BODY_BYTES))
  if (!read.ok) throw new PayloadTooLargeError()
  const raw = read.raw
  let body = undefined
  if (raw.length) {
    const text = raw.toString('utf8')
    const ct = String(req.headers['content-type'] || '')
    if (ct.includes('application/json') || text.startsWith('{') || text.startsWith('[')) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    } else {
      body = text
    }
  }

  return {
    method: req.method || 'GET',
    url: rawUrl,
    headers: req.headers,
    body,
    query,
  }
}

/**
 * @param {string} pathname /api/auth-sign-in or /api/admin-data
 */
function apiModuleName(pathname) {
  const cleaned = pathname.replace(/\/+$/, '') || '/'
  const parts = cleaned.split('/').filter(Boolean)
  if (parts[0] !== 'api' || parts.length < 2) return null
  const name = parts[1]
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return null
  return name
}

/**
 * @param {string} name
 */
async function loadApiHandler(name) {
  if (handlerCache.has(name)) return handlerCache.get(name)
  const filePath = join(API_DIR, `${name}.js`)
  if (!existsSync(filePath)) return null
  const mod = await import(pathToFileURL(filePath).href)
  const handler = mod.default
  if (typeof handler !== 'function') return null
  handlerCache.set(name, handler)
  return handler
}

/**
 * @param {string} distDir
 * @param {string} pathname
 * @param {import('node:http').ServerResponse} res
 */
async function serveStatic(distDir, pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname
  const candidate = normalize(join(distDir, rel))
  if (!candidate.startsWith(distDir + sep) && candidate !== distDir) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  try {
    const st = await stat(candidate)
    if (st.isFile()) {
      const ext = extname(candidate).toLowerCase()
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
      createReadStream(candidate).pipe(res)
      return
    }
  } catch {
    /* fall through to SPA */
  }

  const indexPath = join(distDir, 'index.html')
  try {
    await stat(indexPath)
    res.setHeader('Content-Type', MIME['.html'])
    createReadStream(indexPath).pipe(res)
  } catch {
    res.statusCode = 404
    res.end('Not found. Run npm run build first.')
  }
}

/**
 * @param {{ port?: number, distDir?: string, host?: string }} [opts]
 */
export function createPortableApiHost(opts = {}) {
  const port = Number(opts.port ?? process.env.PORT ?? 8080)
  const host = String(opts.host ?? process.env.HOST ?? '0.0.0.0')
  const distDir = resolve(opts.distDir ?? process.env.STATIC_DIR ?? DEFAULT_DIST)

  const server = createServer(async (rawReq, res) => {
    for (const [name, value] of Object.entries(PORTABLE_SECURITY_HEADERS)) res.setHeader(name, value)
    try {
      const pathname = new URL(rawReq.url || '/', `http://${rawReq.headers.host || 'localhost'}`).pathname

      if (pathname === '/health' || pathname === '/api/health') {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(
          JSON.stringify({
            ok: true,
            service: 'portable-api',
            ts: new Date().toISOString(),
            cloudKey: classifyServiceRoleKeyShape(process.env.SUPABASE_SERVICE_ROLE_KEY),
          }),
        )
        return
      }

      if (pathname === '/auth/v1/token' || pathname === '/auth/v1/user' || pathname === '/auth/v1/logout') {
        const req = await normalizeRequest(rawReq)
        await handleAuthV1(req, res)
        if (!res.writableEnded && !res.headersSent) {
          res.statusCode = 204
          res.end()
        }
        return
      }

      if (pathname.startsWith('/rest/v1/')) {
        const req = await normalizeRequest(rawReq)
        await handleRestV1(req, res)
        return
      }

      if (pathname.startsWith('/api/')) {
        const name = apiModuleName(pathname)
        if (!name) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'Not found' }))
          return
        }
        const handler = await loadApiHandler(name)
        if (!handler) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: `API ${name} не найден` }))
          return
        }
        const req = await normalizeRequest(rawReq)
        await handler(req, res)
        if (!res.writableEnded && !res.headersSent) {
          res.statusCode = 204
          res.end()
        }
        return
      }

      await serveStatic(distDir, pathname, res)
    } catch (e) {
      if (e instanceof PayloadTooLargeError) {
        if (!res.headersSent) {
          res.statusCode = 413
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Connection', 'close')
          res.end(JSON.stringify({ error: PAYLOAD_TOO_LARGE_RU }))
        }
        rawReq.resume()
        return
      }
      console.error('[portable-api]', e)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'Внутренняя ошибка сервера' }))
      }
    }
  })

  return {
    server,
    port,
    host,
    distDir,
    /** @returns {Promise<import('node:http').Server>} */
    listen() {
      return new Promise((resolveListen, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          resolveListen(server)
        })
      })
    },
  }
}
