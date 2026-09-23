/**
 * Сервер: заявка не должна снова ссылаться на удалённого клиента.
 */
import { saleClipPushWhenClientMissing } from '../../src/lib/admin/saleClipClientGoneCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clientId
 * @returns {Promise<boolean|null>} true / false; null — сбой запроса, не гадаем
 */
export async function clientRowExists(supabaseAdmin, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return false
  const { data, error } = await supabaseAdmin.from('clients').select('id').eq('id', id).maybeSingle()
  if (error) return null
  return Boolean(data?.id)
}

/**
 * Снять awaiting-заявки до удаления клиента (пока client_id ещё живой).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clientId
 */
export async function cancelAwaitingSaleClipsForClient(supabaseAdmin, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('sale_clips')
    .update({
      status: 'cancelled',
      client_id: null,
      membership_id: null,
      done_at: null,
      updated_at: now,
    })
    .eq('client_id', id)
    .eq('status', 'awaiting')
  if (error) console.warn('[sale_clips] cancel on client delete', error.message)
}

/**
 * Update заявки: если client_id уже нет в clients — снять заявку, не ловить 400.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {object} payload
 */
export async function prepareSaleClipUpdateForPush(supabaseAdmin, payload) {
  const clientId = String(payload?.client_id ?? '').trim()
  if (!clientId) return payload
  const exists = await clientRowExists(supabaseAdmin, clientId)
  if (exists !== false) return payload
  return saleClipPushWhenClientMissing(payload)
}
