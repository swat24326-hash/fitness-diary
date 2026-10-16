/**
 * POST /api/client-me { action: 'rating-get' | 'rating-answer' | 'rating-dismiss' }
 * GET сводка — loadClientRatingsSummary.
 */
import { sendJson } from '../adminSupabase.js'
import {
  CLIENT_RATING_KINDS,
  clientRatingCopy,
  normalizeRatingScore,
  publicClientRating,
} from '../../../src/lib/client/clientRatingCore.js'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function isMissingTable(e) {
  return /client_ratings|does not exist|42P01/i.test(String(e?.message ?? e?.code ?? ''))
}

const SELECT =
  'id, client_id, club_id, kind, membership_id, score, comment, requested_at, answered_at, notified_at, dismissed_at'

/**
 * Открытые + недавно отвеченные (7 дн.) — для ленты уведомлений.
 */
export async function loadClientRatingsSummary(db, clientId) {
  try {
    const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000
    const list = await rows(
      db
        .from('client_ratings')
        .select(SELECT)
        .eq('client_id', clientId)
        .is('dismissed_at', null)
        .order('requested_at', { ascending: false })
        .limit(20),
    )
    return list
      .filter((r) => !r.answered_at || Date.parse(r.answered_at) >= sinceMs)
      .map(publicClientRating)
      .filter(Boolean)
  } catch (e) {
    if (isMissingTable(e)) return []
    throw e
  }
}

export async function handleClientRatingPost(db, ctx, body, res) {
  const action = String(body?.action ?? '')
  const id = String(body?.id ?? '').trim()
  if (!id) {
    sendJson(res, 400, { error: 'Нет id оценки' })
    return
  }

  let row
  try {
    const found = await rows(db.from('client_ratings').select(SELECT).eq('id', id).eq('client_id', ctx.clientId).limit(1))
    row = found[0]
  } catch (e) {
    if (isMissingTable(e)) {
      sendJson(res, 503, { error: 'Оценки ещё не подключены' })
      return
    }
    throw e
  }
  if (!row) {
    sendJson(res, 404, { error: 'Оценка не найдена' })
    return
  }

  if (action === 'rating-get') {
    sendJson(res, 200, { rating: publicClientRating(row), copy: clientRatingCopy(row.kind) })
    return
  }

  if (action === 'rating-dismiss') {
    if (row.answered_at) {
      sendJson(res, 200, { rating: publicClientRating(row) })
      return
    }
    const updated = await rows(
      db
        .from('client_ratings')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('client_id', ctx.clientId)
        .is('answered_at', null)
        .select(SELECT),
    )
    sendJson(res, 200, { rating: publicClientRating(updated[0] ?? { ...row, dismissed_at: new Date().toISOString() }) })
    return
  }

  if (action === 'rating-answer') {
    if (row.answered_at) {
      sendJson(res, 200, { rating: publicClientRating(row), already: true })
      return
    }
    const score = normalizeRatingScore(body?.score)
    if (score == null) {
      sendJson(res, 400, { error: 'Поставьте оценку от 1 до 5' })
      return
    }
    const comment = String(body?.comment ?? '')
      .trim()
      .slice(0, 300)
    const updated = await rows(
      db
        .from('client_ratings')
        .update({
          score,
          comment: comment || null,
          answered_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('client_id', ctx.clientId)
        .is('answered_at', null)
        .select(SELECT),
    )
    if (!updated[0]) {
      const again = await rows(db.from('client_ratings').select(SELECT).eq('id', id).eq('client_id', ctx.clientId).limit(1))
      sendJson(res, 200, { rating: publicClientRating(again[0]), already: true })
      return
    }
    sendJson(res, 200, { rating: publicClientRating(updated[0]) })
    return
  }

  sendJson(res, 400, { error: 'Неизвестное действие' })
}

export { CLIENT_RATING_KINDS }
