import { ISKRA_DISPATCH_ACTIVE_STATUSES, compactOpenDispatchForPrompt } from '../../src/lib/admin/iskraDispatchCore.js'

const DISPATCH_PROMPT_SELECT =
  'id, kind, status, title, recipient_user_id, priority, task_kind, due_at'

/**
 * Открытые задания Планёрки для контекста ИСКРЫ (admin).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
export async function loadClubOpenDispatchForPrompt(supabaseAdmin, clubId) {
  const id = String(clubId ?? '').trim()
  if (!id) return []

  const { data, error } = await supabaseAdmin
    .from('club_iskra_dispatch')
    .select(DISPATCH_PROMPT_SELECT)
    .eq('club_id', id)
    .in('status', [...ISKRA_DISPATCH_ACTIVE_STATUSES])
    .order('created_at', { ascending: false })
    .limit(12)

  if (error) {
    if (/does not exist|relation.*club_iskra_dispatch/i.test(String(error.message ?? ''))) {
      return []
    }
    throw error
  }
  return compactOpenDispatchForPrompt(data ?? [])
}
