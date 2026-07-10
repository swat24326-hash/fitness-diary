import { sendJson, setCors } from './adminSupabase.js'

/**
 * Обёртка Vercel handler: ловит необработанные исключения → JSON 500 вместо обрыва ответа.
 * @param {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => Promise<void>} handler
 * @param {{ cors?: string, label?: string }} [opts]
 */
export function withSafeApiHandler(handler, opts = {}) {
  const label = opts.label ?? 'api'

  return async function safeHandler(req, res) {
    try {
      await handler(req, res)
    } catch (e) {
      console.error(`[${label}]`, e)
      if (!res.writableEnded && !res.headersSent) {
        sendJson(res, 500, { error: 'Внутренняя ошибка сервера' })
      }
    }
  }
}

/**
 * OPTIONS + CORS для handler, который сам не вызывает setCors.
 * @param {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => Promise<void>} handler
 * @param {{ cors?: string, methods?: string, label?: string }} [opts]
 */
export function withSafeApiHandlerCors(handler, opts = {}) {
  const cors = opts.cors ?? 'GET, POST, OPTIONS'
  const methods = opts.methods ?? cors

  return withSafeApiHandler(async (req, res) => {
    setCors(res, methods)
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    await handler(req, res)
  }, { label: opts.label })
}
