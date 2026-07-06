import { sendJson } from './adminSupabase.js'
import { buildIskraSystemPrompt } from '../../src/lib/admin/geminiIskraCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
export async function loadClubIskraSettings(supabaseAdmin, clubId) {
  const { data, error } = await supabaseAdmin
    .from('club_iskra_settings')
    .select('prompt_append, updated_at')
    .eq('club_id', clubId)
    .maybeSingle()
  if (error) throw error
  return {
    prompt_append: String(data?.prompt_append ?? '').trim(),
    updated_at: data?.updated_at ?? null,
  }
}

/**
 * @param {object} ctx
 * @param {object} req
 * @param {object} res
 */
export async function handleIskraSettingsGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  try {
    let clubName = ''
    const { data: club } = await ctx.supabaseAdmin.from('clubs').select('name').eq('id', clubId).maybeSingle()
    clubName = String(club?.name ?? '').trim()

    const settings = await loadClubIskraSettings(ctx.supabaseAdmin, clubId)
    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      club_name: clubName,
      prompt_append: settings.prompt_append,
      updated_at: settings.updated_at,
      default_prompt_preview: buildIskraSystemPrompt(clubName || 'клуб'),
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка загрузки настроек ИСКРА' })
  }
}

/**
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleIskraSettingsPost(ctx, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  const promptAppend = String(body?.prompt_append ?? '').trim()
  if (promptAppend.length > 8000) {
    sendJson(res, 400, { error: 'Дополнение промпта не длиннее 8000 символов' })
    return
  }

  try {
    const { data, error } = await ctx.supabaseAdmin
      .from('club_iskra_settings')
      .upsert(
        {
          club_id: clubId,
          prompt_append: promptAppend,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'club_id' },
      )
      .select('prompt_append, updated_at')
      .maybeSingle()
    if (error) throw error

    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      prompt_append: String(data?.prompt_append ?? ''),
      updated_at: data?.updated_at ?? null,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка сохранения настроек ИСКРА' })
  }
}
