/**
 * Одна запись очереди → Supabase (используется push-record и push-records).
 */
import { authorizePush } from './mutationAuth.js'
import { normalizeTrainingPayload } from './normalizeTrainingPayload.js'
import { normalizeMembershipPushPayload } from '../../src/lib/membershipPushPayload.js'
import { normalizeMembershipTypePushPayload } from '../../src/lib/admin/membershipTypePushPayload.js'
import { normalizeNutritionProductPushPayload } from '../../src/lib/admin/nutritionProductPushPayload.js'
import { normalizeHomeworkPresetPushPayload } from '../../src/lib/admin/homeworkPresetPushPayload.js'
import { normalizeHealthCardPushPayload } from '../../src/lib/healthCardCore.js'
import { normalizePnkFunnelEventPushPayload } from '../../src/lib/pnk/pnkFunnelEventsCore.js'
import { recordClientDeletionAudit } from './deletionAuditWrite.js'
import { applyLoyaltyClientPushSideEffects } from './loyaltyClientPushSideEffects.js'
import { recordClientRestoreEvent } from './clientRestoreEventWrite.js'
import {
  isWeightEntryTrainingFkError,
  sanitizeWeightEntryTrainingLink,
} from '../../src/lib/clientWeightPushCore.js'

export const PUSH_ALLOWED_TABLES = new Set([
  'clients',
  'memberships',
  'trainings',
  'health_cards',
  'body_measurements',
  'client_weight_entries',
  'challenges',
  'exercises',
  'membership_types',
  'nutrition_products',
  'homework_presets',
  'pnk_funnel_events',
  'sale_clips',
])

function friendlyExerciseDbError(error, operation) {
  const msg = String(error?.message ?? '')
  const code = String(error?.code ?? '')
  if (code === '23505' || /unique|duplicate/i.test(msg)) {
    return 'Упражнение с таким названием уже есть в справочнике'
  }
  if (code === '23503' || /foreign key|violates/i.test(msg)) {
    if (operation === 'delete') {
      return 'Нельзя удалить: упражнение используется в челлендже. Сначала измените или удалите челлендж.'
    }
  }
  return msg || 'Ошибка базы данных'
}

async function prepareChallengePayload(supabaseAdmin, data) {
  const row = { ...(data ?? {}) }
  if (row.created_by) {
    const { data: u } = await supabaseAdmin.from('users').select('id').eq('id', row.created_by).maybeSingle()
    if (!u) row.created_by = null
  }
  const clubId = String(row.club_id ?? '').trim()
  if (!clubId) return { ok: false, error: 'Укажите клуб челленджа' }
  const { data: club } = await supabaseAdmin.from('clubs').select('id').eq('id', clubId).maybeSingle()
  if (!club) return { ok: false, error: 'Клуб не найден в облаке' }

  const exId = String(row.exercise_id ?? '').trim()
  if (!exId) return { ok: false, error: 'Укажите упражнение' }
  const { data: ex } = await supabaseAdmin.from('exercises').select('id').eq('id', exId).maybeSingle()
  if (!ex) {
    return {
      ok: false,
      error:
        'Упражнение не найдено в облаке. В админке: Sync в шапке (подтянуть упражнения), затем создайте челлендж снова или нажмите Sync.',
    }
  }
  if (String(row.metric ?? '') !== 'max_reps') {
    row.reference_weight_kg = null
  } else if (row.reference_weight_kg != null && row.reference_weight_kg !== '') {
    const w = Number(String(row.reference_weight_kg).replace(',', '.'))
    row.reference_weight_kg = Number.isFinite(w) && w > 0 ? Math.round(w * 100) / 100 : null
  } else {
    row.reference_weight_kg = null
  }
  return { ok: true, data: row }
}

function friendlyMembershipTypeDbError(error) {
  const msg = String(error?.message ?? '')
  const code = String(error?.code ?? '')
  if (code === '23505' || /unique|duplicate/i.test(msg)) {
    return 'Тип с таким названием уже есть в этом клубе'
  }
  if (/trainer_pay_per_session|trainer_pay_l[123]/i.test(msg) && /schema cache|could not find/i.test(msg)) {
    return 'Колонки оплаты тренера не созданы в Supabase — выполните миграцию trainer_pay (в т.ч. уровни l1–l3)'
  }
  if (/counts_toward_pay_plan/i.test(msg) && /schema cache|could not find/i.test(msg)) {
    return 'Колонка «В план» не создана в Supabase — выполните миграцию membership_types_counts_toward_pay_plan'
  }
  if (/aerobic_pay_amount|trainer_assignable/i.test(msg) && /schema cache|could not find/i.test(msg)) {
    return 'Колонки АЗ не созданы в Supabase — выполните миграцию membership_types_aerobic'
  }
  return msg || 'Ошибка базы данных'
}

function friendlyClientsDbError(error) {
  const msg = String(error?.message ?? '')
  if (/outreach_name/i.test(msg) && /schema cache|could not find|column/i.test(msg)) {
    return 'Колонка outreach_name не создана в Supabase — выполните миграцию clients_outreach_name'
  }
  if (/archive_reason/i.test(msg) && /schema cache|could not find|column/i.test(msg)) {
    return 'Колонки причины архива не созданы в Supabase — выполните миграцию clients_archive_reason'
  }
  if (/max_chat_url/i.test(msg) && /schema cache|could not find|column/i.test(msg)) {
    return 'Колонка max_chat_url не создана в Supabase — выполните миграцию clients_max_chat_url'
  }
  if (/lifecycle|pnk_/i.test(msg) && /schema cache|could not find|column/i.test(msg)) {
    return 'Колонки воронки ПНК не созданы в Supabase — выполните миграцию pnk_funnel'
  }
  if (/updated_at/i.test(msg) && /schema cache|could not find|column/i.test(msg)) {
    return 'Лишнее поле updated_at у клиента — обновите приложение и повторите Sync'
  }
  return msg || 'Ошибка базы данных'
}

/** clients/memberships в проде без колонки updated_at */
function stripUnknownClientFields(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const next = { ...payload }
  delete next.updated_at
  return next
}

async function prepareWeightEntryPayload(supabaseAdmin, payload) {
  const row = payload && typeof payload === 'object' ? { ...payload } : {}
  const tid = String(row.training_id ?? '').trim()
  if (!tid) return { ok: true, data: row }
  const { data: tr, error } = await supabaseAdmin.from('trainings').select('id').eq('id', tid).maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: sanitizeWeightEntryTrainingLink(row, { trainingExists: Boolean(tr?.id) }) }
}

async function validateMembershipTypeLink(supabaseAdmin, payload, operation, opts = {}) {
  const typeId = String(payload?.membership_type_id ?? '').trim()
  if (!typeId) return { ok: true, data: payload }
  const clubId = String(payload?.club_id ?? '').trim()
  const { data: mt, error } = await supabaseAdmin
    .from('membership_types')
    .select('id, club_id, is_active, trainer_assignable')
    .eq('id', typeId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!mt) return { ok: false, error: 'Тип абонемента не найден' }
  if (clubId && String(mt.club_id) !== clubId) {
    return { ok: false, error: 'Тип абонемента принадлежит другому клубу' }
  }
  if (operation === 'insert' && mt.is_active === false) {
    return { ok: false, error: 'Этот тип абонемента отключён — выберите другой' }
  }
  // АЗ (trainer_assignable=false) — только админ/менеджер (desk), не тренер.
  if (
    operation === 'insert' &&
    mt.trainer_assignable === false &&
    !opts.allowDeskAerobicTypes
  ) {
    return { ok: false, error: 'Этот тип абонемента недоступен для оформления тренером' }
  }
  return { ok: true, data: payload }
}

/**
 * @param {object} ctx — requireAuthUser result
 * @param {{ table_name: string, operation: string, data: object, remote_id?: string | null }} item
 * @returns {Promise<{ ok: boolean, status?: number, error?: string, duplicate?: boolean, record?: object }>}
 */
export async function executePushRecord(ctx, item) {
  const table_name = String(item.table_name ?? '').trim()
  const operation = String(item.operation ?? '').trim()
  const data = item.data
  const remote_id = item.remote_id != null ? String(item.remote_id) : null

  if (!PUSH_ALLOWED_TABLES.has(table_name)) {
    return { ok: false, status: 400, error: 'Таблица не поддерживается' }
  }

  const authz = await authorizePush(ctx, table_name, operation, data, remote_id)
  if (!authz.ok) {
    return { ok: false, status: 403, error: authz.error }
  }

  const { supabaseAdmin } = ctx
  const allowDeskAerobicTypes = Boolean(ctx.isAdmin || ctx.isSalesManager || ctx.isSupervisor)

  try {
    if (operation === 'insert') {
      let payload = data
      if (table_name === 'clients') {
        payload = stripUnknownClientFields(payload)
      }
      if (table_name === 'challenges') {
        const prep = await prepareChallengePayload(supabaseAdmin, data)
        if (!prep.ok) {
          return { ok: false, status: 400, error: prep.error }
        }
        payload = prep.data
      }
      if (table_name === 'trainings') {
        payload = normalizeTrainingPayload(payload)
      }
      if (table_name === 'memberships') {
        const prep = normalizeMembershipPushPayload(payload, { insert: true })
        if (!prep.ok) return { ok: false, status: 400, error: prep.error }
        const link = await validateMembershipTypeLink(supabaseAdmin, prep.data, 'insert', {
          allowDeskAerobicTypes,
        })
        if (!link.ok) return { ok: false, status: 400, error: link.error }
        payload = link.data
      }
      if (table_name === 'membership_types') {
        const prep = normalizeMembershipTypePushPayload(payload, { insert: true })
        if (!prep.ok) return { ok: false, status: 400, error: prep.error }
        payload = prep.data
      }
      if (table_name === 'nutrition_products') {
        payload = normalizeNutritionProductPushPayload(payload)
        if (!payload) return { ok: false, status: 400, error: 'Некорректный продукт питания' }
      }
      if (table_name === 'homework_presets') {
        payload = normalizeHomeworkPresetPushPayload(payload)
        if (!payload) return { ok: false, status: 400, error: 'Некорректный шаблон ДЗ' }
      }
      if (table_name === 'health_cards') {
        payload = normalizeHealthCardPushPayload(payload)
      }
      if (table_name === 'pnk_funnel_events') {
        payload = normalizePnkFunnelEventPushPayload(payload)
        if (!payload) return { ok: false, status: 400, error: 'Некорректное событие воронки ПНК' }
      }
      if (table_name === 'client_weight_entries') {
        const prep = await prepareWeightEntryPayload(supabaseAdmin, payload)
        if (!prep.ok) return { ok: false, status: 400, error: prep.error }
        payload = prep.data
      }
      let { error } = await supabaseAdmin.from(table_name).insert(payload)
      if (
        error &&
        table_name === 'client_weight_entries' &&
        payload?.training_id &&
        isWeightEntryTrainingFkError(error.message)
      ) {
        const retryPayload = sanitizeWeightEntryTrainingLink(payload, { trainingExists: false })
        const retry = await supabaseAdmin.from(table_name).insert(retryPayload)
        error = retry.error
        if (!error) payload = retryPayload
      }
      if (error) {
        if (error.code === '23505') {
          if (table_name === 'exercises' && payload?.name) {
            const { data: existing } = await supabaseAdmin
              .from('exercises')
              .select('*')
              .eq('name', payload.name)
              .maybeSingle()
            if (existing) {
              return { ok: true, duplicate: true, record: existing }
            }
          }
          if (payload?.id) {
            const { data: existingById } = await supabaseAdmin
              .from(table_name)
              .select('*')
              .eq('id', payload.id)
              .maybeSingle()
            if (existingById) {
              return { ok: true, duplicate: true, record: existingById }
            }
          }
          return { ok: true, duplicate: true }
        }
        const errMsg =
          table_name === 'exercises'
            ? friendlyExerciseDbError(error, 'insert')
            : table_name === 'membership_types'
              ? friendlyMembershipTypeDbError(error)
              : table_name === 'clients'
                ? friendlyClientsDbError(error)
                : error.message
        return { ok: false, status: 400, error: errMsg }
      }
      if (table_name === 'clients') {
        await applyLoyaltyClientPushSideEffects({
          supabaseAdmin,
          before: null,
          payload,
          actorId: ctx.profile?.id ?? ctx.user?.id ?? null,
        })
      }
      return { ok: true }
    }

    if (operation === 'update' && remote_id) {
      let payload = table_name === 'trainings' ? normalizeTrainingPayload(data) : data
      if (table_name === 'clients') {
        payload = stripUnknownClientFields(payload)
      }
      if (table_name === 'challenges') {
        const prep = await prepareChallengePayload(supabaseAdmin, data)
        if (!prep.ok) {
          return { ok: false, status: 400, error: prep.error }
        }
        payload = prep.data
      }
      if (table_name === 'memberships') {
        const prep = normalizeMembershipPushPayload(payload)
        if (!prep.ok) return { ok: false, status: 400, error: prep.error }
        const link = await validateMembershipTypeLink(supabaseAdmin, prep.data, 'update', {
          allowDeskAerobicTypes,
        })
        if (!link.ok) return { ok: false, status: 400, error: link.error }
        payload = link.data
      }
      if (table_name === 'membership_types') {
        const prep = normalizeMembershipTypePushPayload(payload)
        if (!prep.ok) return { ok: false, status: 400, error: prep.error }
        payload = prep.data
      }
      if (table_name === 'nutrition_products') {
        payload = normalizeNutritionProductPushPayload(payload)
        if (!payload) return { ok: false, status: 400, error: 'Некорректный продукт питания' }
      }
      if (table_name === 'homework_presets') {
        payload = normalizeHomeworkPresetPushPayload(payload)
        if (!payload) return { ok: false, status: 400, error: 'Некорректный шаблон ДЗ' }
      }
      if (table_name === 'health_cards') {
        payload = normalizeHealthCardPushPayload(payload)
      }
      if (table_name === 'client_weight_entries') {
        const prep = await prepareWeightEntryPayload(supabaseAdmin, payload)
        if (!prep.ok) return { ok: false, status: 400, error: prep.error }
        payload = prep.data
      }
      let clientBefore = null
      let clientBeforeReady = table_name !== 'clients'
      if (table_name === 'clients') {
        const prev = await supabaseAdmin
          .from('clients')
          .select('id, club_id, trainer_id, archived_at, archive_reason')
          .eq('id', remote_id)
          .maybeSingle()
        if (prev.error) {
          console.warn('[loyalty] clients before-select', prev.error.message)
        } else if (prev.data) {
          clientBefore = prev.data
          clientBeforeReady = true
        }
      }
      let { error } = await supabaseAdmin.from(table_name).update(payload).eq('id', remote_id)
      if (
        error &&
        table_name === 'client_weight_entries' &&
        payload?.training_id &&
        isWeightEntryTrainingFkError(error.message)
      ) {
        const retryPayload = sanitizeWeightEntryTrainingLink(payload, { trainingExists: false })
        const retry = await supabaseAdmin.from(table_name).update(retryPayload).eq('id', remote_id)
        error = retry.error
        if (!error) payload = retryPayload
      }
      if (error) {
        const errMsg =
          table_name === 'exercises'
            ? friendlyExerciseDbError(error, 'update')
            : table_name === 'membership_types'
              ? friendlyMembershipTypeDbError(error)
              : table_name === 'clients'
                ? friendlyClientsDbError(error)
                : error.message
        return { ok: false, status: 400, error: errMsg }
      }
      if (table_name === 'clients' && clientBeforeReady) {
        await applyLoyaltyClientPushSideEffects({
          supabaseAdmin,
          before: clientBefore,
          payload,
          actorId: ctx.profile?.id ?? ctx.user?.id ?? null,
        })
        await recordClientRestoreEvent(supabaseAdmin, {
          before: clientBefore,
          payload,
          actorId: ctx.profile?.id ?? ctx.user?.id ?? null,
          source: 'push',
        })
      }
      return { ok: true }
    }

    if (operation === 'delete' && remote_id) {
      if (table_name === 'clients') {
        await recordClientDeletionAudit(ctx, remote_id, data, { source: 'push' })
      }
      const { error } = await supabaseAdmin.from(table_name).delete().eq('id', remote_id)
      if (error) {
        const errMsg = table_name === 'exercises' ? friendlyExerciseDbError(error, 'delete') : error.message
        return { ok: false, status: 400, error: errMsg }
      }
      return { ok: true }
    }

    return { ok: false, status: 400, error: 'Некорректные operation / remote_id' }
  } catch (e) {
    return { ok: false, status: 500, error: e?.message ? String(e.message) : 'Server error' }
  }
}
