import { sendJson } from './adminSupabase.js'
import {
  applyLearningEventToSignalRow,
  applyPlaybookNoteSave,
  buildLearningBundleFromRows,
  normalizeLearningEvent,
  normalizePlaybookSave,
} from '../../src/lib/admin/iskraLearningCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
export async function loadClubLearningBundle(supabaseAdmin, clubId) {
  const { data, error } = await supabaseAdmin
    .from('club_iskra_learning_signals')
    .select(
      'signal_key, positive_count, negative_count, engagement_count, score, playbook_note, playbook_confirmed, last_positive_at, last_negative_at, updated_at',
    )
    .eq('club_id', clubId)
    .order('score', { ascending: false })
    .limit(40)

  if (error) {
    if (/does not exist|relation.*club_iskra_learning/i.test(String(error.message ?? ''))) {
      return buildLearningBundleFromRows([])
    }
    throw error
  }
  return buildLearningBundleFromRows(data ?? [])
}

/**
 * @param {object} ctx
 * @param {object} req
 * @param {object} res
 */
export async function handleIskraLearningGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  try {
    const bundle = await loadClubLearningBundle(ctx.supabaseAdmin, clubId)
    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      phase: bundle.phase,
      playbooks: bundle.playbooks,
      signals: bundle.signals,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка загрузки обучения' })
  }
}

/**
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
async function handleIskraLearningSavePlaybook(ctx, res, body) {
  const parsed = normalizePlaybookSave(body)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  const { clubId, signalKey, note, confirmed } = parsed.payload

  try {
    const { data: existing, error: loadErr } = await ctx.supabaseAdmin
      .from('club_iskra_learning_signals')
      .select(
        'signal_key, positive_count, negative_count, engagement_count, score, playbook_note, playbook_confirmed, last_positive_at, last_negative_at',
      )
      .eq('club_id', clubId)
      .eq('signal_key', signalKey)
      .maybeSingle()

    if (loadErr) {
      if (/does not exist|relation.*club_iskra_learning/i.test(String(loadErr.message ?? ''))) {
        sendJson(res, 200, { ok: true, stored: false, reason: 'migration_pending' })
        return
      }
      throw loadErr
    }

    const row = applyPlaybookNoteSave(existing, { signal_key: signalKey, note, confirmed })
    const { error: upsertErr } = await ctx.supabaseAdmin.from('club_iskra_learning_signals').upsert(
      { club_id: clubId, ...row },
      { onConflict: 'club_id,signal_key' },
    )
    if (upsertErr) throw upsertErr

    sendJson(res, 200, {
      ok: true,
      stored: true,
      signal_key: signalKey,
      playbook_confirmed: row.playbook_confirmed,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка сохранения урока' })
  }
}

/**
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleIskraLearningPost(ctx, res, body) {
  const op = String(body?.op ?? '').trim().toLowerCase()
  if (op === 'save_playbook') {
    return handleIskraLearningSavePlaybook(ctx, res, body)
  }

  const normalized = normalizeLearningEvent(body)
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error })
    return
  }

  const event = normalized.event
  const clubId = event.club_id

  try {
    const { data: existing, error: loadErr } = await ctx.supabaseAdmin
      .from('club_iskra_learning_signals')
      .select(
        'signal_key, positive_count, negative_count, engagement_count, score, playbook_note, playbook_confirmed, last_positive_at, last_negative_at',
      )
      .eq('club_id', clubId)
      .eq('signal_key', event.signal_key)
      .maybeSingle()

    if (loadErr) {
      if (/does not exist|relation.*club_iskra_learning/i.test(String(loadErr.message ?? ''))) {
        sendJson(res, 200, {
          ok: true,
          stored: false,
          reason: 'migration_pending',
          signal_key: event.signal_key,
        })
        return
      }
      throw loadErr
    }

    const row = applyLearningEventToSignalRow(existing, event)
    const { error: upsertErr } = await ctx.supabaseAdmin.from('club_iskra_learning_signals').upsert(
      {
        club_id: clubId,
        ...row,
      },
      { onConflict: 'club_id,signal_key' },
    )
    if (upsertErr) throw upsertErr

    sendJson(res, 200, {
      ok: true,
      stored: true,
      signal_key: event.signal_key,
      score: row.score,
      positive_count: row.positive_count,
      negative_count: row.negative_count,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка сохранения сигнала обучения' })
  }
}
