/**
 * GET /api/story-media?t=… — видео сторис с Range (без Bearer, короткий JWT).
 */
import { sendJson, setCors } from '../adminSupabase.js'
import { getVoiceSlice } from '../chat/chatVoiceStorage.js'
import { storyMediaContentRange } from '../../../src/lib/stories/storyMediaRangeCore.js'
import { verifyStoryMediaToken } from './storyMediaTokenCore.js'

/**
 * @param {string | string[] | undefined} header
 * @returns {{ start: number, end: number | null } | null}
 */
function wantRange(header) {
  const raw = Array.isArray(header) ? header[0] : header
  const m = /^bytes=(\d*)-(\d*)$/i.exec(String(raw || '').trim())
  if (!m || m[1] === '') return null
  const start = Number(m[1])
  if (!Number.isFinite(start) || start < 0) return null
  if (m[2] === '') return { start, end: null }
  const end = Number(m[2])
  if (!Number.isFinite(end) || end < start) return null
  return { start, end }
}

export async function storyMediaHandler(req, res) {
  setCors(res, 'GET, HEAD, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Метод не поддерживается' })
  }
  const secret = String(process.env.JWT_SECRET || '').trim()
  if (!secret) return sendJson(res, 503, { error: 'Сервис временно недоступен' })

  const url = new URL(req.url || '/', 'http://local')
  const token = url.searchParams.get('t') || ''
  const checked = verifyStoryMediaToken(token, secret)
  if (!checked.ok) return sendJson(res, 401, { error: checked.error })

  const rangeWant = wantRange(req.headers.range || req.headers.Range)
  let slice
  try {
    slice = await getVoiceSlice(checked.key, rangeWant)
  } catch (e) {
    console.warn('[story-media]', e?.message || e)
    return sendJson(res, 502, { error: 'Не получилось загрузить' })
  }
  if (!slice) return sendJson(res, 410, { error: 'Кадр уже недоступен' })

  const isPartial = Boolean(rangeWant) && (slice.start > 0 || slice.end < slice.size - 1 || rangeWant != null)
  // 206 если клиент просил Range (даже bytes=0-…) — так ждёт Safari/Chrome
  const use206 = Boolean(rangeWant)
  res.statusCode = use206 ? 206 : 200
  res.setHeader('Content-Type', checked.mime)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'private, max-age=120')
  res.setHeader('Content-Length', String(slice.bytes.length))
  if (use206 || isPartial) {
    res.setHeader(
      'Content-Range',
      storyMediaContentRange({ start: slice.start, end: slice.end, size: slice.size }),
    )
  }
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  res.end(slice.bytes)
}
