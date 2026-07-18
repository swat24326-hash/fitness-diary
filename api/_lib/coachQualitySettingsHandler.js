import { sendJson } from './adminSupabase.js'
import {
  defaultCoachQualityConfig,
  normalizeCoachQualityConfig,
  validateCoachQualityConfigForSave,
  coachQualityToggleMeta,
} from '../../src/lib/admin/coachQualityConfigCore.js'
import { coachQualityRulesHelp } from '../../src/lib/admin/coachQualityCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @returns {Promise<{ config: object, updated_at: string|null, missingTable?: boolean }>}
 */
export async function loadClubCoachQualitySettings(supabaseAdmin, clubId) {
  const { data, error } = await supabaseAdmin
    .from('club_coach_quality_settings')
    .select('config, updated_at')
    .eq('club_id', clubId)
    .maybeSingle()
  if (error) {
    const msg = String(error.message ?? '')
    if (/does not exist|schema cache|club_coach_quality_settings/i.test(msg)) {
      return { config: defaultCoachQualityConfig(), updated_at: null, missingTable: true }
    }
    throw error
  }
  return {
    config: normalizeCoachQualityConfig(data?.config),
    updated_at: data?.updated_at ?? null,
    missingTable: false,
  }
}

export async function handleCoachQualitySettingsGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  try {
    let clubName = ''
    const { data: club } = await ctx.supabaseAdmin.from('clubs').select('name').eq('id', clubId).maybeSingle()
    clubName = String(club?.name ?? '').trim()
    const row = await loadClubCoachQualitySettings(ctx.supabaseAdmin, clubId)
    const config = row.config
    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      club_name: clubName,
      config,
      default_config: defaultCoachQualityConfig(),
      toggles: coachQualityToggleMeta(),
      rules_preview: coachQualityRulesHelp(config),
      updated_at: row.updated_at,
      migration_needed: Boolean(row.missingTable),
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка загрузки настроек' })
  }
}

export async function handleCoachQualitySettingsPost(ctx, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  const reset = body?.reset === true
  const validated = reset
    ? { ok: true, config: defaultCoachQualityConfig() }
    : validateCoachQualityConfigForSave(body?.config ?? body)
  if (!validated.ok) {
    sendJson(res, 400, { error: validated.error })
    return
  }
  try {
    const now = new Date().toISOString()
    const { error } = await ctx.supabaseAdmin.from('club_coach_quality_settings').upsert(
      {
        club_id: clubId,
        config: validated.config,
        updated_at: now,
      },
      { onConflict: 'club_id' },
    )
    if (error) {
      const msg = String(error.message ?? '')
      if (/does not exist|schema cache|club_coach_quality_settings/i.test(msg)) {
        sendJson(res, 400, {
          error:
            'Таблица настроек ещё не создана. Примените миграцию club_coach_quality_settings (см. docs/COACH_QUALITY.md).',
        })
        return
      }
      throw error
    }
    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      config: validated.config,
      rules_preview: coachQualityRulesHelp(validated.config),
      updated_at: now,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка сохранения' })
  }
}
