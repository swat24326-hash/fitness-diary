/**
 * Контекст ЗП клуба: live или снимок прошлого календарного месяца (service role).
 */
import { loadClubTrainerPayPlanSettings } from './trainerPayPlanSettingsHandler.js'
import { loadTrainerPayProfilesMapForClub, loadTrainerPayProfilesForClub } from './trainerPayProfileSettingsHandler.js'
import { normalizeTrainerPayPlanConfig } from '../../src/lib/admin/trainerPayPlanCore.js'
import { indexTrainerPayProfilesByTrainerId } from '../../src/lib/admin/trainerPayProfileCore.js'
import {
  buildPayMonthSnapshotPayload,
  normalizePayMonthSnapshotPayload,
  shouldFreezePayMonth,
} from '../../src/lib/admin/trainerPayMonthSnapshotCore.js'
import { monthPartsFromIso } from '../../src/lib/admin/salesReportCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
async function loadLivePayrollParts(supabaseAdmin, clubId) {
  const [planRow, profilesPack] = await Promise.all([
    loadClubTrainerPayPlanSettings(supabaseAdmin, cidSafe(clubId)).catch(() => ({
      config: normalizeTrainerPayPlanConfig(null),
    })),
    loadTrainerPayProfilesMapForClub(supabaseAdmin, cidSafe(clubId)).catch(() => ({
      map: new Map(),
      missingTable: false,
    })),
  ])
  return {
    planConfig: normalizeTrainerPayPlanConfig(planRow?.config),
    profilesByTrainerId: profilesPack?.map ?? new Map(),
    profilesMissingTable: Boolean(profilesPack?.missingTable),
  }
}

function cidSafe(clubId) {
  return String(clubId ?? '').trim()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 */
async function readPayMonthSnapshot(supabaseAdmin, clubId, year, month) {
  const { data, error } = await supabaseAdmin
    .from('club_trainer_pay_month_snapshots')
    .select('payload, frozen_at')
    .eq('club_id', clubId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (error) {
    const msg = String(error.message ?? '')
    if (/does not exist|schema cache|club_trainer_pay_month_snapshots/i.test(msg)) {
      return { missingTable: true, row: null }
    }
    throw error
  }
  return { missingTable: false, row: data ?? null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 * @param {object} payload
 */
async function insertPayMonthSnapshot(supabaseAdmin, clubId, year, month, payload) {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('club_trainer_pay_month_snapshots')
    .upsert(
      {
        club_id: clubId,
        year,
        month,
        payload,
        frozen_at: now,
      },
      { onConflict: 'club_id,year,month', ignoreDuplicates: true },
    )
    .select('payload, frozen_at')
    .maybeSingle()
  if (error) {
    const msg = String(error.message ?? '')
    if (/does not exist|schema cache|club_trainer_pay_month_snapshots/i.test(msg)) {
      return { missingTable: true, row: null }
    }
    // Гонка: уже создали — читаем
    if (/duplicate|unique/i.test(msg)) {
      return readPayMonthSnapshot(supabaseAdmin, clubId, year, month)
    }
    throw error
  }
  if (data) return { missingTable: false, row: data }
  return readPayMonthSnapshot(supabaseAdmin, clubId, year, month)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @param {{
 *   year?: number,
 *   month?: number,
 *   today?: Date,
 *   membershipTypes?: Array<object>,
 * }} [opts]
 */
export async function loadTrainerPayrollContext(supabaseAdmin, clubId, opts = {}) {
  const cid = cidSafe(clubId)
  if (!cid) {
    return {
      planConfig: normalizeTrainerPayPlanConfig(null),
      profilesByTrainerId: new Map(),
      membershipTypes: [],
      clubId: '',
      frozen: false,
    }
  }

  const year = Number(opts.year)
  const month = Number(opts.month)
  const today = opts.today ?? new Date()
  const liveTypes = Array.isArray(opts.membershipTypes) ? opts.membershipTypes : null

  const live = await loadLivePayrollParts(supabaseAdmin, cid)
  let membershipTypes = liveTypes
  if (!membershipTypes) {
    const { data } = await supabaseAdmin
      .from('membership_types')
      .select(
        'id, code, sort_order, is_active, trainer_assignable, trainer_pay_per_session, trainer_pay_l1, trainer_pay_l2, trainer_pay_l3, aerobic_pay_amount',
      )
      .eq('club_id', cid)
      .order('sort_order', { ascending: true })
    membershipTypes = data ?? []
  }

  const canFreeze =
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    month >= 1 &&
    month <= 12 &&
    shouldFreezePayMonth(year, month, today)

  if (!canFreeze) {
    return {
      planConfig: live.planConfig,
      profilesByTrainerId: live.profilesByTrainerId,
      membershipTypes,
      clubId: cid,
      frozen: false,
    }
  }

  let snapPack = await readPayMonthSnapshot(supabaseAdmin, cid, year, month)
  if (snapPack.missingTable) {
    return {
      planConfig: live.planConfig,
      profilesByTrainerId: live.profilesByTrainerId,
      membershipTypes,
      clubId: cid,
      frozen: false,
      migration_needed: true,
    }
  }

  if (!snapPack.row) {
    const profilesList = await loadTrainerPayProfilesForClub(supabaseAdmin, cid).catch(() => ({
      profiles: [],
    }))
    const payload = buildPayMonthSnapshotPayload({
      planConfig: live.planConfig,
      profiles: profilesList.profiles ?? [],
      membershipTypes,
    })
    snapPack = await insertPayMonthSnapshot(supabaseAdmin, cid, year, month, payload)
    if (snapPack.missingTable || !snapPack.row) {
      return {
        planConfig: live.planConfig,
        profilesByTrainerId: live.profilesByTrainerId,
        membershipTypes,
        clubId: cid,
        frozen: false,
        migration_needed: Boolean(snapPack.missingTable),
      }
    }
  }

  const payload = normalizePayMonthSnapshotPayload(snapPack.row.payload)
  return {
    planConfig: payload.planConfig,
    profilesByTrainerId: indexTrainerPayProfilesByTrainerId(payload.profiles),
    membershipTypes: payload.membershipTypes,
    clubId: cid,
    frozen: true,
    frozen_at: snapPack.row.frozen_at ?? null,
    year,
    month,
  }
}

/**
 * Год/месяц из ISO-даты (для pull / self-stats).
 * @param {string} iso
 */
export function payrollYearMonthFromIso(iso) {
  const parts = monthPartsFromIso(String(iso ?? '').slice(0, 10))
  if (!parts) return null
  return { year: parts.year, month: parts.month }
}

/**
 * @param {object} ctx from loadTrainerPayrollContext
 * @param {Array<object>} membershipTypes live types (fallback если не frozen)
 * @param {{ trainerIdFilter?: string|null }} [extra]
 */
export function payrollOptsFromContext(ctx, membershipTypes, extra = {}) {
  const types =
    ctx?.frozen && Array.isArray(ctx.membershipTypes) && ctx.membershipTypes.length > 0
      ? ctx.membershipTypes
      : membershipTypes
  return {
    membershipTypes: types,
    planConfig: ctx.planConfig,
    profilesByTrainerId: ctx.profilesByTrainerId,
    clubId: ctx.clubId,
    ...extra,
  }
}
