import { sendJson } from './adminSupabase.js'
import { buildIskraSystemPrompt } from '../../src/lib/admin/geminiIskraCore.js'
import {
  defaultIskraQuickChips,
  parseStoredQuickChips,
  resolveIskraQuickChips,
  validateIskraQuickChipsForSave,
} from '../../src/lib/admin/iskraQuickChipsCore.js'
import {
  defaultOutreachTemplates,
  parseStoredOutreachTemplates,
  resolveOutreachTemplates,
  validateOutreachTemplatesForSave,
} from '../../src/lib/trainer/trainerClientOutreachCore.js'
import {
  defaultClubSmsTemplates,
  parseStoredClubSmsTemplates,
  resolveClubSmsTemplates,
  validateClubSmsTemplatesForSave,
} from '../../src/lib/admin/clubSmsTemplatesCore.js'
import {
  mergeMoiZvonkiClubConfigForStore,
  parseStoredMoiZvonkiClubConfig,
  resolveMoiZvonkiConfig,
  shapeMoiZvonkiPublicStatus,
  validateMoiZvonkiClubConfigForSave,
} from '../../src/lib/admin/moiZvonkiClubConfigCore.js'
import { getMoiZvonkiConfigFromEnv } from './moiZvonkiCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
export async function loadClubIskraSettings(supabaseAdmin, clubId) {
  const { data, error } = await supabaseAdmin
    .from('club_iskra_settings')
    .select(
      'prompt_append, quick_chips, spark_brief_enabled, outreach_templates, club_sms_templates, moizvonki, updated_at',
    )
    .eq('club_id', clubId)
    .maybeSingle()
  if (error) throw error
  return {
    prompt_append: String(data?.prompt_append ?? '').trim(),
    quick_chips: data?.quick_chips ?? null,
    spark_brief_enabled: data?.spark_brief_enabled !== false,
    outreach_templates: data?.outreach_templates ?? null,
    club_sms_templates: data?.club_sms_templates ?? null,
    moizvonki: data?.moizvonki ?? null,
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
    const storedChips = parseStoredQuickChips(settings.quick_chips)
    const quickChips = storedChips ?? defaultIskraQuickChips()
    const storedOutreach = parseStoredOutreachTemplates(settings.outreach_templates)
    const outreachTemplates = storedOutreach ?? resolveOutreachTemplates(null)
    const storedClubSms = parseStoredClubSmsTemplates(settings.club_sms_templates)
    const clubSmsTemplates = storedClubSms ?? resolveClubSmsTemplates(null)
    const mzResolved = resolveMoiZvonkiConfig({
      clubStored: settings.moizvonki,
      envConfig: getMoiZvonkiConfigFromEnv(),
    })
    const clubMz = parseStoredMoiZvonkiClubConfig(settings.moizvonki)

    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      club_name: clubName,
      prompt_append: settings.prompt_append,
      quick_chips: quickChips,
      quick_chips_custom: storedChips != null,
      default_quick_chips: defaultIskraQuickChips(),
      outreach_templates: outreachTemplates,
      outreach_templates_custom: storedOutreach != null,
      default_outreach_templates: defaultOutreachTemplates(),
      club_sms_templates: clubSmsTemplates,
      club_sms_templates_custom: storedClubSms != null,
      default_club_sms_templates: defaultClubSmsTemplates(),
      moizvonki: shapeMoiZvonkiPublicStatus(mzResolved),
      moizvonki_club: {
        user_email: clubMz.userEmail || '',
        api_base: clubMz.apiBase || '',
        has_api_key: Boolean(clubMz.apiKey),
      },
      updated_at: settings.updated_at,
      spark_brief_enabled: settings.spark_brief_enabled,
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

  let quickChipsToStore = null
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'quick_chips')) {
    const validated = validateIskraQuickChipsForSave(body.quick_chips)
    if (!validated.ok) {
      sendJson(res, 400, { error: validated.error })
      return
    }
    const defaults = defaultIskraQuickChips()
    const sameAsDefault = JSON.stringify(validated.chips) === JSON.stringify(defaults)
    quickChipsToStore = sameAsDefault ? null : validated.chips
  }

  let outreachTemplatesToStore = undefined
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'outreach_templates')) {
    const validated = validateOutreachTemplatesForSave(body.outreach_templates)
    if (!validated.ok) {
      sendJson(res, 400, { error: validated.error })
      return
    }
    outreachTemplatesToStore = validated.templates
  }

  let clubSmsTemplatesToStore = undefined
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'club_sms_templates')) {
    const validated = validateClubSmsTemplatesForSave(body.club_sms_templates)
    if (!validated.ok) {
      sendJson(res, 400, { error: validated.error })
      return
    }
    clubSmsTemplatesToStore = validated.templates
  }

  let moizvonkiToStore = undefined
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'moizvonki')) {
    const validated = validateMoiZvonkiClubConfigForSave(body.moizvonki)
    if (!validated.ok) {
      sendJson(res, 400, { error: validated.error })
      return
    }
    moizvonkiToStore = validated
  }

  try {
    const existing = await loadClubIskraSettings(ctx.supabaseAdmin, clubId)
    const row = {
      club_id: clubId,
      prompt_append: Object.prototype.hasOwnProperty.call(body ?? {}, 'prompt_append')
        ? promptAppend
        : existing.prompt_append,
      updated_at: new Date().toISOString(),
    }

    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'spark_brief_enabled')) {
      row.spark_brief_enabled = body.spark_brief_enabled !== false
    }

    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'quick_chips')) {
      row.quick_chips = quickChipsToStore
    } else {
      row.quick_chips = existing.quick_chips
    }

    if (outreachTemplatesToStore !== undefined) {
      row.outreach_templates = outreachTemplatesToStore
    } else {
      row.outreach_templates = existing.outreach_templates
    }

    if (clubSmsTemplatesToStore !== undefined) {
      row.club_sms_templates = clubSmsTemplatesToStore
    } else {
      row.club_sms_templates = existing.club_sms_templates
    }

    if (moizvonkiToStore !== undefined) {
      row.moizvonki = mergeMoiZvonkiClubConfigForStore(
        existing.moizvonki,
        moizvonkiToStore.patch,
        moizvonkiToStore.clear,
      )
      if (!moizvonkiToStore.clear && row.moizvonki == null) {
        sendJson(res, 400, {
          error: 'Укажите API-ключ Мои Звонки (при первой настройке клуба ключ обязателен)',
        })
        return
      }
    } else {
      row.moizvonki = existing.moizvonki
    }

    const { data, error } = await ctx.supabaseAdmin
      .from('club_iskra_settings')
      .upsert(row, { onConflict: 'club_id' })
      .select(
        'prompt_append, quick_chips, spark_brief_enabled, outreach_templates, club_sms_templates, moizvonki, updated_at',
      )
      .maybeSingle()
    if (error) throw error

    const resolved = resolveIskraQuickChips(data?.quick_chips)
    const outreachResolved = parseStoredOutreachTemplates(data?.outreach_templates) ?? resolveOutreachTemplates(null)
    const clubSmsResolved =
      parseStoredClubSmsTemplates(data?.club_sms_templates) ?? resolveClubSmsTemplates(null)
    const mzResolved = resolveMoiZvonkiConfig({
      clubStored: data?.moizvonki,
      envConfig: getMoiZvonkiConfigFromEnv(),
    })
    const clubMz = parseStoredMoiZvonkiClubConfig(data?.moizvonki)

    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      prompt_append: String(data?.prompt_append ?? ''),
      quick_chips: resolved,
      quick_chips_custom: data?.quick_chips != null,
      outreach_templates: outreachResolved,
      outreach_templates_custom: data?.outreach_templates != null,
      club_sms_templates: clubSmsResolved,
      club_sms_templates_custom: data?.club_sms_templates != null,
      moizvonki: shapeMoiZvonkiPublicStatus(mzResolved),
      moizvonki_club: {
        user_email: clubMz.userEmail || '',
        api_base: clubMz.apiBase || '',
        has_api_key: Boolean(clubMz.apiKey),
      },
      spark_brief_enabled: data?.spark_brief_enabled !== false,
      updated_at: data?.updated_at ?? null,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка сохранения настроек ИСКРА' })
  }
}
