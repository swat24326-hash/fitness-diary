import { sendJson } from './adminSupabase.js'
import {
  defaultTrainerPayPlanConfig,
  describeTrainerPayPlanBands,
  normalizeTrainerPayPlanConfig,
  validateTrainerPayPlanConfigForSave,
} from '../../src/lib/admin/trainerPayPlanCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
export async function loadClubTrainerPayPlanSettings(supabaseAdmin, clubId) {
  const { data, error } = await supabaseAdmin
    .from('club_trainer_pay_plan_settings')
    .select('config, updated_at')
    .eq('club_id', clubId)
    .maybeSingle()
  if (error) {
    const msg = String(error.message ?? '')
    if (/does not exist|schema cache|club_trainer_pay_plan_settings/i.test(msg)) {
      return { config: defaultTrainerPayPlanConfig(), updated_at: null, missingTable: true }
    }
    throw error
  }
  return {
    config: normalizeTrainerPayPlanConfig(data?.config),
    updated_at: data?.updated_at ?? null,
    missingTable: false,
    hasRow: Boolean(data),
  }
}

export async function handleTrainerPayPlanSettingsGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  try {
    let clubName = ''
    const { data: club } = await ctx.supabaseAdmin.from('clubs').select('name').eq('id', clubId).maybeSingle()
    clubName = String(club?.name ?? '').trim()
    const row = await loadClubTrainerPayPlanSettings(ctx.supabaseAdmin, clubId)
    const config = row.config
    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      club_name: clubName,
      config,
      default_config: defaultTrainerPayPlanConfig(),
      bands: describeTrainerPayPlanBands(config),
      updated_at: row.updated_at,
      migration_needed: Boolean(row.missingTable),
      using_defaults: !row.hasRow && !row.missingTable,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка загрузки настроек плана' })
  }
}

export async function handleTrainerPayPlanSettingsPost(ctx, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  const reset = body?.reset === true
  const validated = reset
    ? { ok: true, config: defaultTrainerPayPlanConfig() }
    : validateTrainerPayPlanConfigForSave(body?.config ?? body)
  if (!validated.ok) {
    sendJson(res, 400, { error: validated.error })
    return
  }
  try {
    const now = new Date().toISOString()
    const { error } = await ctx.supabaseAdmin.from('club_trainer_pay_plan_settings').upsert(
      {
        club_id: clubId,
        config: validated.config,
        updated_at: now,
      },
      { onConflict: 'club_id' },
    )
    if (error) {
      const msg = String(error.message ?? '')
      if (/does not exist|schema cache|club_trainer_pay_plan_settings/i.test(msg)) {
        sendJson(res, 400, {
          error:
            'Таблица настроек плана ещё не создана. Примените миграцию club_trainer_pay_plan_settings.',
        })
        return
      }
      throw error
    }
    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      config: validated.config,
      bands: describeTrainerPayPlanBands(validated.config),
      updated_at: now,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка сохранения плана' })
  }
}
