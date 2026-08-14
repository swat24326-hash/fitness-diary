import { createClient } from '@supabase/supabase-js'
import { sendJson, readEnv } from './adminSupabase.js'
import { parseStoredMoiZvonkiClubConfig } from '../../src/lib/admin/moiZvonkiClubConfigCore.js'
import {
  buildClubCallFinishPatch,
  moiZvonkiWebhookSecretMatches,
  parseMoiZvonkiWebhookBody,
  pickClubCallLogRowForFinish,
  shapeCallFinishFromMoiZvonkiEvent,
} from '../../src/lib/admin/clubCallOutcomeCore.js'

/**
 * @param {import('http').IncomingMessage} req
 */
export function readMoiZvonkiWebhookSecretFromRequest(req) {
  const q = String(req.query?.secret ?? '').trim()
  if (q) return q
  const h = req.headers?.['x-moizvonki-webhook-secret']
  return String(Array.isArray(h) ? h[0] : h ?? '').trim()
}

function createWebhookServiceClient() {
  const { url, serviceKey } = readEnv()
  if (!url || !serviceKey) {
    throw new Error('Нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY на сервере')
  }
  return createClient(url, serviceKey)
}

/**
 * @param {object} supabaseAdmin
 * @param {string} userLogin
 * @returns {Promise<string[]>}
 */
async function resolveClubIdsForMoiZvonkiLogin(supabaseAdmin, userLogin) {
  const login = String(userLogin ?? '').trim().toLowerCase()
  if (!login) return []
  const { data, error } = await supabaseAdmin
    .from('club_iskra_settings')
    .select('club_id, moizvonki')
  if (error) throw new Error(error.message || 'club_iskra_settings query failed')
  const ids = []
  for (const row of data ?? []) {
    const cfg = parseStoredMoiZvonkiClubConfig(row?.moizvonki)
    if (String(cfg.userEmail ?? '')
      .trim()
      .toLowerCase() === login) {
      const id = String(row.club_id ?? '').trim()
      if (id) ids.push(id)
    }
  }
  return ids
}

/**
 * POST admin-data?action=moizvonki-webhook&secret=…
 * Без Bearer: секрет в query/header. Подписка: webhook.subscribe → call.finish.
 *
 * @param {object} req
 * @param {object} res
 * @param {object} body
 */
export async function handleMoiZvonkiWebhookPost(req, res, body) {
  const expected = String(process.env.MOIZVONKI_WEBHOOK_SECRET ?? '').trim()
  const got = readMoiZvonkiWebhookSecretFromRequest(req)
  if (!moiZvonkiWebhookSecretMatches(expected, got)) {
    sendJson(res, 403, { ok: false, error: 'forbidden', code: 'forbidden' })
    return
  }

  const parsed = parseMoiZvonkiWebhookBody(body)
  if (!parsed.ok) {
    sendJson(res, 400, { ok: false, error: parsed.error, code: 'bad_request' })
    return
  }

  if (parsed.action !== 'call.finish') {
    sendJson(res, 200, { ok: true, ignored: true, action: parsed.action })
    return
  }

  const finish = shapeCallFinishFromMoiZvonkiEvent(parsed.event)
  if (!finish.phone) {
    sendJson(res, 200, { ok: true, ignored: true, reason: 'no_phone' })
    return
  }

  let supabaseAdmin
  try {
    supabaseAdmin = createWebhookServiceClient()
  } catch (e) {
    sendJson(res, 503, {
      ok: false,
      error: String(e?.message ?? 'no service client'),
      code: 'not_configured',
    })
    return
  }

  let clubIds = []
  try {
    clubIds = await resolveClubIdsForMoiZvonkiLogin(supabaseAdmin, parsed.user_login)
  } catch (e) {
    sendJson(res, 500, {
      ok: false,
      error: String(e?.message ?? e).slice(0, 160),
      code: 'db_error',
    })
    return
  }

  const sinceIso = new Date(Date.now() - 45 * 60 * 1000).toISOString()

  if (!clubIds.length) {
    const envLogin = String(process.env.MOIZVONKI_USER_EMAIL ?? '')
      .trim()
      .toLowerCase()
    if (envLogin && envLogin === parsed.user_login) {
      const { data: recent } = await supabaseAdmin
        .from('club_call_log')
        .select('club_id')
        .eq('status', 'ok')
        .is('finished_at', null)
        .gte('created_at', sinceIso)
        .limit(80)
      clubIds = [...new Set((recent ?? []).map((r) => String(r.club_id ?? '').trim()).filter(Boolean))]
    }
  }

  if (!clubIds.length) {
    sendJson(res, 200, {
      ok: true,
      matched: false,
      reason: 'no_club_for_login',
      user_login: parsed.user_login || null,
    })
    return
  }

  const patch = buildClubCallFinishPatch(finish)
  let updatedId = null
  let matchedClubId = null

  for (const clubId of clubIds) {
    const { data: rows, error } = await supabaseAdmin
      .from('club_call_log')
      .select(
        'id, club_id, client_id, phone, status, outcome, finished_at, created_at, duration_sec, answered',
      )
      .eq('club_id', clubId)
      .eq('status', 'ok')
      .is('finished_at', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(40)

    if (error) {
      sendJson(res, 500, {
        ok: false,
        error: String(error.message ?? error).slice(0, 160),
        code: 'db_error',
      })
      return
    }

    const match = pickClubCallLogRowForFinish(rows ?? [], {
      phone: finish.phone,
      start_time_ms: finish.start_time_ms,
      end_time_ms: finish.end_time_ms,
    })
    if (!match?.id) continue

    const { error: updErr } = await supabaseAdmin
      .from('club_call_log')
      .update(patch)
      .eq('id', match.id)
      .is('finished_at', null)

    if (updErr) {
      // Колонок outcome ещё нет — мягкий ответ, чтобы Мои Звонки не долбили.
      const msg = String(updErr.message ?? '')
      if (/outcome|duration_sec|finished_at|recording_url|schema cache|column/i.test(msg)) {
        sendJson(res, 503, {
          ok: false,
          error: 'Нужна миграция club_call_log outcome на Supabase',
          code: 'migration_pending',
          detail: msg.slice(0, 120),
        })
        return
      }
      sendJson(res, 500, { ok: false, error: msg.slice(0, 160), code: 'db_error' })
      return
    }

    updatedId = String(match.id)
    matchedClubId = clubId
    break
  }

  sendJson(res, 200, {
    ok: true,
    matched: Boolean(updatedId),
    log_id: updatedId,
    club_id: matchedClubId,
    outcome: patch.outcome,
    duration_sec: patch.duration_sec,
    phone: finish.phone,
  })
}
