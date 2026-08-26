/**
 * Сервер: закрыть awaiting-клипы, уже не нужные; дописать client_id по карте.
 */
import { planSupersededAwaitingSaleClips } from '../../src/lib/admin/saleClipPullPruneCore.js'
import { normalizeSalesCardNumber } from '../../src/lib/admin/salesClientMatchCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {object[]} awaitingClips
 * @returns {Promise<object[]>} surviving awaiting (с обновлённым client_id при bind)
 */
export async function reconcileAndFilterAwaitingSaleClips(supabaseAdmin, awaitingClips) {
  const clips = Array.isArray(awaitingClips) ? awaitingClips : []
  if (!clips.length) return []

  const clubIds = [...new Set(clips.map((c) => String(c?.club_id ?? '').trim()).filter(Boolean))]
  const cards = [
    ...new Set(
      clips
        .filter((c) => !String(c?.client_id ?? '').trim())
        .map((c) => normalizeSalesCardNumber(c?.card_number) || String(c?.card_number ?? '').trim())
        .filter(Boolean),
    ),
  ]

  /** @type {Map<string, object>} */
  const clientsByCard = new Map()
  if (clubIds.length && cards.length) {
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, card_number, club_id, name, archived_at')
      .in('club_id', clubIds.slice(0, 20))
      .in('card_number', cards.slice(0, 200))
    for (const row of clients ?? []) {
      if (row?.archived_at) continue
      const card = normalizeSalesCardNumber(row.card_number) || String(row.card_number ?? '').trim()
      if (!card || clientsByCard.has(card)) continue
      clientsByCard.set(card, row)
    }
  }

  const clientIds = [
    ...new Set([
      ...clips.map((c) => String(c?.client_id ?? '').trim()).filter(Boolean),
      ...[...clientsByCard.values()].map((c) => String(c.id).trim()).filter(Boolean),
    ]),
  ]
  /** @type {Record<string, object[]>} */
  const membershipsByClientId = {}
  if (clientIds.length) {
    const { data: mems, error } = await supabaseAdmin
      .from('memberships')
      .select('id, client_id, clip_id, created_at')
      .in('client_id', clientIds.slice(0, 800))
    if (!error) {
      for (const m of mems ?? []) {
        const cid = String(m.client_id ?? '').trim()
        if (!cid) continue
        if (!membershipsByClientId[cid]) membershipsByClientId[cid] = []
        membershipsByClientId[cid].push(m)
      }
    }
  }

  const plan = planSupersededAwaitingSaleClips(clips, membershipsByClientId, { clientsByCard })
  if (!plan.length) return clips

  const now = new Date().toISOString()
  const closedIds = new Set()
  /** @type {Map<string, string>} */
  const boundClientByClip = new Map()

  for (const item of plan) {
    if (item.action === 'bind_client' && item.clientId) {
      const { error } = await supabaseAdmin
        .from('sale_clips')
        .update({ client_id: item.clientId, updated_at: now })
        .eq('id', item.clipId)
        .eq('status', 'awaiting')
      if (!error) boundClientByClip.set(item.clipId, item.clientId)
      continue
    }

    if (item.action === 'done') {
      const patch = {
        status: 'done',
        membership_id: item.membershipId,
        done_at: now,
        updated_at: now,
      }
      if (item.clientId) patch.client_id = item.clientId
      // clip_id на абоне — чтобы повторно не «исполнять»
      if (item.membershipId) {
        await supabaseAdmin
          .from('memberships')
          .update({ clip_id: item.clipId, updated_at: now })
          .eq('id', item.membershipId)
          .is('clip_id', null)
      }
      const { error } = await supabaseAdmin.from('sale_clips').update(patch).eq('id', item.clipId).eq('status', 'awaiting')
      if (!error) closedIds.add(item.clipId)
      continue
    }

    if (item.action === 'cancel') {
      const { error } = await supabaseAdmin
        .from('sale_clips')
        .update({
          status: 'cancelled',
          updated_at: now,
          note: String(item.reason || 'Заявка снята').slice(0, 500),
        })
        .eq('id', item.clipId)
        .eq('status', 'awaiting')
      if (!error) closedIds.add(item.clipId)
    }
  }

  return clips
    .filter((c) => !closedIds.has(String(c?.id ?? '')))
    .map((c) => {
      const id = String(c?.id ?? '')
      const bound = boundClientByClip.get(id)
      return bound ? { ...c, client_id: bound } : c
    })
}
