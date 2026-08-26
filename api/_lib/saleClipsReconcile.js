/**
 * Сервер: закрыть awaiting-клипы, уже не нужные (абоны созданы иначе).
 */
import { planSupersededAwaitingSaleClips } from '../../src/lib/admin/saleClipPullPruneCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {object[]} awaitingClips
 * @returns {Promise<object[]>} surviving awaiting
 */
export async function reconcileAndFilterAwaitingSaleClips(supabaseAdmin, awaitingClips) {
  const clips = Array.isArray(awaitingClips) ? awaitingClips : []
  if (!clips.length) return []

  const clientIds = [...new Set(clips.map((c) => String(c?.client_id ?? '').trim()).filter(Boolean))]
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

  const plan = planSupersededAwaitingSaleClips(clips, membershipsByClientId)
  if (!plan.length) return clips

  const now = new Date().toISOString()
  const closedIds = new Set()
  for (const item of plan) {
    const patch =
      item.action === 'done'
        ? {
            status: 'done',
            membership_id: item.membershipId,
            done_at: now,
            updated_at: now,
          }
        : {
            status: 'cancelled',
            updated_at: now,
            note: String(item.reason || 'Абон уже есть — заявка снята').slice(0, 500),
          }
    const { error } = await supabaseAdmin.from('sale_clips').update(patch).eq('id', item.clipId).eq('status', 'awaiting')
    if (!error) closedIds.add(item.clipId)
  }

  return clips.filter((c) => !closedIds.has(String(c?.id ?? '')))
}
