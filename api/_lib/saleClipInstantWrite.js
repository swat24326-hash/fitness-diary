/**
 * Запись абонемента из клипа в облако (service role). Пуш не шлём.
 * Решения — в saleClipInstantCore / saleClipCancelCore.
 */

import { todayLocalIso } from '../../src/lib/dateRu.js'
import {
  buildAutoCloseHallsWithoutLiveMembership,
  buildReconcileClubArchiveClientPatch,
  planEnsureOpenHallAfterMembership,
} from '../../src/lib/clientHallLifecycleCore.js'
import { isOpenPnkClient } from '../../src/lib/pnk/pnkStagesCore.js'
import { assertClubCardAvailableForCreate } from '../../src/lib/admin/salesClientMatchCore.js'
import { planSaleClipCancel } from '../../src/lib/admin/saleClipCancelCore.js'
import {
  buildInstantMembershipInsert,
  findSameDayDuplicateMembership,
  planFulfillAwaitingSaleClip,
  planSaleClipMembershipUpdate,
  planSaleClipTrainerAssign,
  validateInstantSaleClipMembership,
} from '../../src/lib/admin/saleClipInstantCore.js'

const CLIP_SELECT =
  'id, club_id, trainer_id, client_id, membership_id, status, clip_date, client_name, phone, card_number, birth_date, membership_type_id, membership_type_label, total_trainings, start_date, end_date, note, created_by, created_at, updated_at, done_at'

const MEMBERSHIP_SELECT =
  'id, client_id, club_id, start_date, end_date, total_trainings, used_trainings, membership_type_id, clip_id, hall, created_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} clientId
 * @param {object[]} memberships
 * @param {string} now
 */
async function openPzLikeTablet(supabase, clientId, memberships, now) {
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, club_id, trainer_id, archived_at, lifecycle')
    .eq('id', clientId)
    .maybeSingle()
  if (clientErr || !client) return { ok: false, reason: clientErr?.message || 'Клиент не найден для направления ПЗ' }

  const { data: life, error: lifeErr } = await supabase
    .from('client_hall_lifecycle')
    .select('id, client_id, club_id, hall, closed_at, close_reason, close_reason_at, expected_return_on, updated_at')
    .eq('client_id', clientId)
  if (lifeErr) return { ok: false, reason: lifeErr.message || 'Не удалось прочитать направления' }

  const plan = planEnsureOpenHallAfterMembership({
    client,
    hall: 'pz',
    memberships,
    lifecycleRows: life ?? [],
    asOf: todayLocalIso(),
    nowIso: now,
  })
  if (!plan.ok) return { ok: false, reason: plan.error || 'Не удалось открыть направление ПЗ' }
  if (plan.skipped) return { ok: true, skipped: true }

  if (plan.lifecycleRow) {
    const { error } = await supabase.from('client_hall_lifecycle').upsert(plan.lifecycleRow, { onConflict: 'id' })
    if (error) return { ok: false, reason: error.message || 'Не удалось открыть направление ПЗ' }
  }
  if (plan.clientPatch) {
    const { error } = await supabase
      .from('clients')
      .update({ ...plan.clientPatch, updated_at: now })
      .eq('id', clientId)
    if (error) return { ok: false, reason: error.message || 'Не удалось обновить карточку после абонемента' }
  }
  return { ok: true, skipped: false }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} clientId
 * @param {string} membershipId
 */
async function countCompletedTrainings(supabase, clientId, membershipId) {
  const { count, error } = await supabase
    .from('trainings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .eq('data->>membership_id', membershipId)
  if (error) return { ok: false, reason: 'Не удалось проверить, есть ли занятие по этому пакету' }
  return { ok: true, count: Number(count) || 0 }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   clubId: string,
 *   body: object,
 *   plan: { clip: object, warnings?: string[], match?: object },
 *   allClubClients: object[],
 *   clients: object[],
 *   createdBy?: string|null,
 * }} input
 */
export async function commitInstantSaleClip(supabase, input) {
  const { clubId, body, plan, allClubClients, clients } = input
  const instant = validateInstantSaleClipMembership({ ...plan.clip, ...body })
  if (!instant.ok) return { status: 400, body: { error: instant.reason, reason: instant.reason, warnings: plan.warnings } }

  const { data: typeRow, error: typeErr } = await supabase
    .from('membership_types')
    .select('id, club_id')
    .eq('id', instant.fields.membership_type_id)
    .maybeSingle()
  if (typeErr || !typeRow || String(typeRow.club_id) !== clubId) {
    const reason = 'Тип абонемента не найден в этом клубе'
    return { status: 400, body: { error: reason, reason, warnings: plan.warnings } }
  }

  const now = new Date().toISOString()
  let clientId = plan.clip.client_id ? String(plan.clip.client_id) : ''
  /** @type {string[]} */
  const warnings = [...(plan.warnings ?? [])]

  if (!clientId) {
    const cardCheck = assertClubCardAvailableForCreate(allClubClients, clubId, plan.clip.card_number)
    if (!cardCheck.ok) return { status: 400, body: { error: cardCheck.error, reason: cardCheck.error } }
    clientId = crypto.randomUUID()
    const { error: insErr } = await supabase.from('clients').insert({
      id: clientId,
      name: plan.clip.client_name,
      phone: plan.clip.phone,
      card_number: plan.clip.card_number,
      birth_date: plan.clip.birth_date,
      trainer_id: plan.clip.trainer_id,
      club_id: clubId,
      lifecycle: 'active',
      created_at: now,
    })
    if (insErr) {
      const reason = insErr.message || 'Не удалось создать клиента'
      return { status: 400, body: { error: reason, reason } }
    }
  } else {
    const existing = clients.find((c) => String(c.id) === clientId)
    const assign = planSaleClipTrainerAssign({
      client: existing,
      selectedTrainerId: plan.clip.trainer_id,
      confirmTransfer: body.confirm_transfer === true || body.confirmTransfer === true,
    })
    if (!assign.ok) return { status: 400, body: { error: assign.reason, reason: assign.reason, warnings } }

    const patch = { updated_at: now }
    if (plan.match?.fillCard) {
      const fillCheck = assertClubCardAvailableForCreate(allClubClients, clubId, plan.match.fillCard, {
        excludeClientId: clientId,
      })
      if (!fillCheck.ok) return { status: 400, body: { error: fillCheck.error, reason: fillCheck.error } }
      patch.card_number = plan.match.fillCard
    }
    if (isOpenPnkClient(existing)) {
      patch.lifecycle = 'active'
      patch.pnk_won_at = now
      patch.pnk_stage = 'won'
    }
    if (assign.transferred) patch.trainer_id = assign.trainerId
    if (Object.keys(patch).length > 1) {
      const { error: upErr } = await supabase.from('clients').update(patch).eq('id', clientId)
      if (upErr) return { status: 400, body: { error: upErr.message || 'Не удалось обновить карточку', reason: upErr.message } }
    }
  }

  const { data: mems, error: memErr } = await supabase
    .from('memberships')
    .select(MEMBERSHIP_SELECT)
    .eq('client_id', clientId)
  if (memErr) return { status: 400, body: { error: memErr.message || 'Не удалось проверить пакеты', reason: memErr.message } }

  const day = String(plan.clip.clip_date ?? todayLocalIso()).slice(0, 10)
  const duplicate = findSameDayDuplicateMembership(mems ?? [], instant.fields, day)
  const clipId = crypto.randomUUID()
  let membership = duplicate
  let createdMembership = false

  if (!membership) {
    const row = buildInstantMembershipInsert({
      id: crypto.randomUUID(),
      clientId,
      clubId,
      clipId,
      fields: instant.fields,
      now,
    })
    const { data: inserted, error: mIns } = await supabase.from('memberships').insert(row).select(MEMBERSHIP_SELECT).maybeSingle()
    if (mIns || !inserted) {
      const reason = mIns?.message || 'Не удалось создать абонемент'
      return { status: 400, body: { error: reason, reason, warnings } }
    }
    membership = inserted
    createdMembership = true
  }

  const clipRow = {
    ...plan.clip,
    id: clipId,
    client_id: clientId,
    status: 'done',
    membership_id: membership.id,
    created_by: input.createdBy ?? null,
    created_at: now,
    updated_at: now,
    done_at: now,
  }
  const { data: created, error: clipErr } = await supabase.from('sale_clips').insert(clipRow).select(CLIP_SELECT).maybeSingle()
  if (clipErr || !created) {
    if (createdMembership) {
      await supabase.from('memberships').delete().eq('id', membership.id)
    }
    const reason = clipErr?.message || 'Не сохранилось: клип не создан'
    return { status: 400, body: { error: reason, reason, warnings } }
  }

  const membershipsAfter = createdMembership ? [...(mems ?? []), membership] : mems ?? []
  const hall = await openPzLikeTablet(supabase, clientId, membershipsAfter, now)
  if (!hall.ok && hall.reason) warnings.push(`Абонемент создан, направление ПЗ не открылось: ${hall.reason}`)

  return {
    status: 200,
    body: {
      clip: created,
      membership,
      warnings,
      already: !createdMembership,
      reason: createdMembership ? 'Абонемент создан' : 'Такой пакет уже есть сегодня — второй не создаём',
      match: plan.match
        ? { status: plan.match.status, matchedBy: plan.match.matchedBy, reason: plan.match.reason }
        : null,
    },
  }
}

/**
 * Старая awaiting: пакет на этот же клип, строка становится done. Второй клип не пишем.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   clubId: string,
 *   clipId: string,
 *   membershipTypeId?: unknown,
 *   totalTrainings?: unknown,
 *   startDate?: unknown,
 *   endDate?: unknown,
 * }} input
 */
export async function fulfillAwaitingSaleClip(supabase, input) {
  const { data: clip, error: loadErr } = await supabase
    .from('sale_clips')
    .select(CLIP_SELECT)
    .eq('id', input.clipId)
    .maybeSingle()
  if (loadErr || !clip) return { status: 404, body: { error: 'Клип не найден' } }
  if (String(clip.club_id) !== input.clubId) return { status: 403, body: { error: 'Клип другого клуба' } }

  const planned = planFulfillAwaitingSaleClip(clip, {
    membership_type_id: input.membershipTypeId ?? clip.membership_type_id,
    total_trainings: input.totalTrainings ?? clip.total_trainings,
    start_date: input.startDate ?? clip.start_date,
    end_date: input.endDate ?? clip.end_date,
  })
  if (!planned.ok) return { status: 400, body: { error: planned.reason, reason: planned.reason, needsFields: planned.needsFields === true } }

  const { data: typeRow, error: typeErr } = await supabase
    .from('membership_types')
    .select('id, club_id, code')
    .eq('id', planned.fields.membership_type_id)
    .maybeSingle()
  if (typeErr || !typeRow || String(typeRow.club_id) !== input.clubId) {
    const reason = 'Тип абонемента не найден в этом клубе'
    return { status: 400, body: { error: reason, reason } }
  }

  const now = new Date().toISOString()
  const { data: mems, error: memErr } = await supabase
    .from('memberships')
    .select(MEMBERSHIP_SELECT)
    .eq('client_id', planned.clientId)
  if (memErr) return { status: 400, body: { error: memErr.message || 'Не удалось проверить пакеты', reason: memErr.message } }

  const duplicate = findSameDayDuplicateMembership(mems ?? [], planned.fields, planned.clipDate)
  let membership = duplicate
  let createdMembership = false
  if (!membership) {
    const row = buildInstantMembershipInsert({
      id: crypto.randomUUID(),
      clientId: planned.clientId,
      clubId: input.clubId,
      clipId: clip.id,
      fields: planned.fields,
      now,
    })
    const { data: inserted, error: mIns } = await supabase.from('memberships').insert(row).select(MEMBERSHIP_SELECT).maybeSingle()
    if (mIns || !inserted) {
      const reason = mIns?.message || 'Не удалось создать абонемент'
      return { status: 400, body: { error: reason, reason } }
    }
    membership = inserted
    createdMembership = true
  } else if (!String(membership.clip_id ?? '').trim()) {
    await supabase.from('memberships').update({ clip_id: clip.id }).eq('id', membership.id).is('clip_id', null)
    membership = { ...membership, clip_id: clip.id }
  }

  const { data: updated, error: clipErr } = await supabase
    .from('sale_clips')
    .update({
      status: 'done',
      client_id: planned.clientId,
      membership_id: membership.id,
      membership_type_id: planned.fields.membership_type_id,
      membership_type_label: String(typeRow.code ?? clip.membership_type_label ?? '').trim() || null,
      total_trainings: planned.fields.total_trainings,
      start_date: planned.fields.start_date,
      end_date: planned.fields.end_date,
      done_at: now,
      updated_at: now,
    })
    .eq('id', clip.id)
    .eq('status', 'awaiting')
    .select(CLIP_SELECT)
    .maybeSingle()
  if (clipErr || !updated) {
    if (createdMembership) await supabase.from('memberships').delete().eq('id', membership.id)
    const reason = clipErr?.message || 'Заявка уже закрыта'
    return { status: 400, body: { error: reason, reason } }
  }

  const warnings = []
  const hall = await openPzLikeTablet(supabase, planned.clientId, [...(mems ?? []), membership], now)
  if (!hall.ok && hall.reason) warnings.push(`Абонемент создан, направление ПЗ не открылось: ${hall.reason}`)

  return {
    status: 200,
    body: {
      clip: updated,
      membership,
      warnings,
      already: !createdMembership,
      reason: createdMembership ? 'Абонемент создан' : 'Такой пакет уже есть в этот день — заявку закрыли им',
    },
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ clubId: string, clipId: string, isAdmin?: boolean }} input
 */
export async function cancelInstantSaleClip(supabase, input) {
  const { data: clip, error: loadErr } = await supabase
    .from('sale_clips')
    .select('id, status, club_id, client_id, membership_id')
    .eq('id', input.clipId)
    .maybeSingle()
  if (loadErr || !clip) return { status: 404, body: { error: 'Клип не найден' } }
  if (String(clip.club_id) !== input.clubId) return { status: 403, body: { error: 'Клип другого клуба' } }

  const now = new Date().toISOString()
  const membershipId = String(clip.membership_id ?? '').trim()
  if (!membershipId) {
    const { data: updated, error } = await supabase
      .from('sale_clips')
      .update({ status: 'cancelled', updated_at: now, done_at: null })
      .eq('id', clip.id)
      .select(CLIP_SELECT)
      .maybeSingle()
    if (error) return { status: 400, body: { error: error.message || 'Не удалось отменить' } }
    return { status: 200, body: { clip: updated, reason: 'Клип отменён' } }
  }

  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select(MEMBERSHIP_SELECT)
    .eq('id', membershipId)
    .maybeSingle()
  if (memErr) return { status: 400, body: { error: memErr.message || 'Не удалось прочитать абонемент' } }
  if (membership && String(membership.club_id) !== input.clubId) {
    return { status: 403, body: { error: 'Абонемент другого клуба' } }
  }

  const counted = membership
    ? await countCompletedTrainings(supabase, String(membership.client_id), membershipId)
    : { ok: true, count: 0 }
  if (!counted.ok) return { status: 400, body: { error: counted.reason, reason: counted.reason } }

  const decision = planSaleClipCancel({
    completedTrainingsCount: counted.count,
    usedTrainings: membership?.used_trainings ?? 0,
    role: input.isAdmin ? 'admin' : 'sales_manager',
  })
  if (!decision.canRemoveMembership) {
    return { status: 400, body: { error: decision.reason, reason: decision.reason } }
  }

  if (membership) {
    const { error: delErr } = await supabase.from('memberships').delete().eq('id', membership.id).eq('club_id', input.clubId)
    if (delErr) return { status: 400, body: { error: delErr.message || 'Не удалось снять пакет' } }
  }

  const { data: updated, error } = await supabase
    .from('sale_clips')
    .update({ status: 'cancelled', membership_id: null, done_at: null, updated_at: now })
    .eq('id', clip.id)
    .select(CLIP_SELECT)
    .maybeSingle()
  if (error) return { status: 400, body: { error: error.message || 'Пакет снят, клип не обновился' } }

  if (membership?.client_id) {
    await closePzIfNoLivePackage(supabase, String(membership.client_id), now)
  }

  return { status: 200, body: { clip: updated, reason: 'Клип и абонемент сняты' } }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} clientId
 * @param {string} now
 */
async function closePzIfNoLivePackage(supabase, clientId, now) {
  const { data: client } = await supabase
    .from('clients')
    .select('id, club_id, archived_at, lifecycle')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return
  const [{ data: mems }, { data: life }] = await Promise.all([
    supabase.from('memberships').select(MEMBERSHIP_SELECT).eq('client_id', clientId),
    supabase
      .from('client_hall_lifecycle')
      .select('id, client_id, club_id, hall, closed_at, close_reason, close_reason_at, expected_return_on, updated_at')
      .eq('client_id', clientId),
  ])
  const rows = buildAutoCloseHallsWithoutLiveMembership({
    client,
    memberships: mems ?? [],
    lifecycleRows: life ?? [],
    asOf: todayLocalIso(),
    nowIso: now,
  })
  for (const row of rows) {
    await supabase.from('client_hall_lifecycle').upsert(row, { onConflict: 'id' })
  }
  const reconcile = buildReconcileClubArchiveClientPatch({
    client,
    memberships: mems ?? [],
    lifecycleRows: [...(life ?? []), ...rows],
    asOf: todayLocalIso(),
    nowIso: now,
  })
  if (reconcile.ok && reconcile.clientPatch) {
    await supabase.from('clients').update({ ...reconcile.clientPatch, updated_at: now }).eq('id', clientId)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ clubId: string, clipId: string, startDate?: unknown, endDate?: unknown, totalTrainings?: unknown }} input
 */
export async function updateInstantSaleClipMembership(supabase, input) {
  const { data: clip, error: clipErr } = await supabase
    .from('sale_clips')
    .select('id, club_id, membership_id, status')
    .eq('id', input.clipId)
    .maybeSingle()
  if (clipErr || !clip) return { status: 404, body: { error: 'Клип не найден' } }

  const membershipId = String(clip.membership_id ?? '').trim()
  const { data: membership, error: memErr } = membershipId
    ? await supabase.from('memberships').select(MEMBERSHIP_SELECT).eq('id', membershipId).maybeSingle()
    : { data: null, error: null }
  if (memErr) return { status: 400, body: { error: memErr.message || 'Не удалось прочитать абонемент' } }

  const planned = planSaleClipMembershipUpdate({
    clubId: input.clubId,
    clip,
    membership,
    startDate: input.startDate,
    endDate: input.endDate,
    totalTrainings: input.totalTrainings,
  })
  if (!planned.ok) return { status: 400, body: { error: planned.reason, reason: planned.reason } }

  const { data: updated, error } = await supabase
    .from('memberships')
    .update(planned.patch)
    .eq('id', membership.id)
    .eq('club_id', input.clubId)
    .select(MEMBERSHIP_SELECT)
    .maybeSingle()
  if (error || !updated) return { status: 400, body: { error: error?.message || 'Не удалось сохранить пакет' } }

  await supabase
    .from('sale_clips')
    .update({
      start_date: planned.patch.start_date,
      end_date: planned.patch.end_date,
      total_trainings: planned.patch.total_trainings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clip.id)

  return { status: 200, body: { membership: updated, reason: 'Пакет обновлён' } }
}
