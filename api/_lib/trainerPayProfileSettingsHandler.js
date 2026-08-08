import { sendJson } from './adminSupabase.js'
import {
  defaultTrainerPayProfile,
  indexTrainerPayProfilesByTrainerId,
  normalizeTrainerPayProfile,
  validateTrainerPayProfileForSave,
} from '../../src/lib/admin/trainerPayProfileCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
export async function loadTrainerPayProfilesForClub(supabaseAdmin, clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { profiles: [], missingTable: false }
  const { data, error } = await supabaseAdmin
    .from('trainer_pay_profiles')
    .select('trainer_id, club_id, on_plan, rate_adjustment_rub, updated_at')
    .eq('club_id', cid)
  if (error) {
    const msg = String(error.message ?? '')
    if (/does not exist|schema cache|trainer_pay_profiles/i.test(msg)) {
      return { profiles: [], missingTable: true }
    }
    throw error
  }
  return {
    profiles: (data ?? []).map((row) => normalizeTrainerPayProfile(row)),
    missingTable: false,
  }
}

/** @returns {Promise<Map<string, import('../../src/lib/admin/trainerPayProfileCore.js').TrainerPayProfile>>} */
export async function loadTrainerPayProfilesMapForClub(supabaseAdmin, clubId) {
  const { profiles, missingTable } = await loadTrainerPayProfilesForClub(supabaseAdmin, clubId)
  return {
    map: indexTrainerPayProfilesByTrainerId(profiles),
    missingTable,
  }
}

export async function handleTrainerPayProfilesGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  try {
    const { data: trainers, error: te } = await ctx.supabaseAdmin
      .from('users')
      .select('id, name')
      .eq('club_id', clubId)
      .or('role.eq.trainer,role.eq.тренер')
      .order('name', { ascending: true })
    if (te) throw te

    const loaded = await loadTrainerPayProfilesForClub(ctx.supabaseAdmin, clubId)
    const byId = indexTrainerPayProfilesByTrainerId(loaded.profiles)
    const profiles = (trainers ?? []).map((t) => {
      const tid = String(t.id)
      const existing = byId.get(tid)
      return existing
        ? { ...existing, trainer_name: t.name ?? '' }
        : { ...defaultTrainerPayProfile(tid, clubId), trainer_name: t.name ?? '' }
    })

    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      profiles,
      migration_needed: loaded.missingTable,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка загрузки кабинетов' })
  }
}

export async function handleTrainerPayProfilesPost(ctx, res, body) {
  const validated = validateTrainerPayProfileForSave(body)
  if (!validated.ok) {
    sendJson(res, 400, { error: validated.error })
    return
  }
  const { profile } = validated
  try {
    const { data: user, error: ue } = await ctx.supabaseAdmin
      .from('users')
      .select('id, club_id, role')
      .eq('id', profile.trainer_id)
      .maybeSingle()
    if (ue) throw ue
    if (!user) {
      sendJson(res, 404, { error: 'Тренер не найден' })
      return
    }
    const role = String(user.role ?? '').toLowerCase()
    if (role !== 'trainer' && role !== 'тренер') {
      sendJson(res, 400, { error: 'Кабинет только для тренера' })
      return
    }
    if (String(user.club_id ?? '') !== profile.club_id) {
      sendJson(res, 400, { error: 'Тренер не из этого клуба' })
      return
    }

    const now = new Date().toISOString()
    const { data, error } = await ctx.supabaseAdmin
      .from('trainer_pay_profiles')
      .upsert(
        {
          trainer_id: profile.trainer_id,
          club_id: profile.club_id,
          on_plan: profile.on_plan,
          rate_adjustment_rub: profile.rate_adjustment_rub,
          updated_at: now,
        },
        { onConflict: 'trainer_id' },
      )
      .select('trainer_id, club_id, on_plan, rate_adjustment_rub, updated_at')
      .maybeSingle()
    if (error) {
      const msg = String(error.message ?? '')
      if (/does not exist|schema cache|trainer_pay_profiles/i.test(msg)) {
        sendJson(res, 400, {
          error: 'Таблица кабинетов ещё не создана. Примените миграцию trainer_pay_profiles.',
        })
        return
      }
      throw error
    }
    sendJson(res, 200, {
      ok: true,
      profile: normalizeTrainerPayProfile(data ?? profile),
      updated_at: data?.updated_at ?? now,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка сохранения кабинета' })
  }
}
