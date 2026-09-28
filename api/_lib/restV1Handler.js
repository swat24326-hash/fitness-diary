import { sendJson, setCors } from './adminSupabase.js'
import { isOwnAuthProvider, ownAuthEnvError } from './authOwnCore.js'
import { verifyBearerOwn } from './authPortOwn.js'
import { isPgDataBackend, pgDataBackendEnvError } from './pgRest/backend.js'
import { compilePgRestQuery } from './pgRest/buildSql.js'
import { loadUdtOf } from './pgRest/pool.js'
import { parseRestV1Request, stripHiddenColumns } from './pgRest/restV1Parse.js'
import { restV1ErrorFromPg, shapeRestV1Response } from './pgRest/restV1Shape.js'
import { executeCompiledAsUser } from './pgRest/rlsTx.js'

function restError(res, status, code, message) {
  sendJson(res, status, { code, message, details: null, hint: null })
}

/** Включается только вместе: свой Auth (кто спрашивает) + своя база (куда спрашивает). */
export function isRestV1Enabled() {
  return isOwnAuthProvider() && isPgDataBackend()
}

/**
 * Совместимый с supabase-js кусок PostgREST: /rest/v1/<table> под RLS.
 * @param {import('http').IncomingMessage & { body?: unknown }} req
 * @param {import('http').ServerResponse} res
 */
export async function handleRestV1(req, res) {
  setCors(res, 'GET, HEAD, POST, PATCH, DELETE, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, content-type, apikey, x-client-info, prefer, accept, range, accept-profile, content-profile',
  )
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (!isRestV1Enabled()) {
    restError(res, 404, 'PGRST_OFF', 'Не найдено')
    return
  }
  const envErr = ownAuthEnvError() || pgDataBackendEnvError()
  if (envErr) {
    restError(res, 500, 'PGRST_ENV', envErr)
    return
  }

  const header = String(req.headers.authorization ?? '')
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const { user, error: authErr } = await verifyBearerOwn(token)
  if (authErr || !user) {
    restError(res, 401, 'PGRST301', 'Сессия недействительна — войдите снова')
    return
  }

  const url = new URL(req.url || '/', 'http://localhost')
  const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (segments.length !== 3 || segments[0] !== 'rest' || segments[1] !== 'v1') {
    restError(res, 404, 'PGRST125', 'Не найдено')
    return
  }
  const parsed = parseRestV1Request({
    method: req.method,
    table: decodeURIComponent(segments[2]),
    params: url.searchParams,
    headers: req.headers,
    body: req.body,
  })
  if (parsed.error) {
    restError(res, parsed.error.status, parsed.error.code, parsed.error.message)
    return
  }

  try {
    const udtOf = await loadUdtOf(parsed.spec.table)
    const compiled = compilePgRestQuery(parsed.spec, { udtOf })
    if (compiled.error) {
      restError(res, 400, 'PGRST100', compiled.error)
      return
    }
    const out = await executeCompiledAsUser(compiled, user)
    const rows = stripHiddenColumns(parsed.spec.table, out.rows)
    const shaped = shapeRestV1Response(parsed, rows, out.count)
    res.statusCode = shaped.status
    for (const [key, value] of Object.entries(shaped.headers)) res.setHeader(key, value)
    if (shaped.body === undefined || req.method === 'HEAD') {
      res.end()
      return
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(shaped.body))
  } catch (e) {
    const mapped = restV1ErrorFromPg(e)
    sendJson(res, mapped.status, mapped.body)
  }
}
