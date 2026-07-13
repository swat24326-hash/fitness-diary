import {
  formatDispatchForUi,
  ISKRA_DISPATCH_ACTIVE_STATUSES,
  compactOpenDispatchForPrompt,
} from '../../src/lib/admin/iskraDispatchCore.js'
import { buildPlanerkaFeedPayload } from '../../src/lib/admin/iskraPlanerkaFeedCore.js'

const DISPATCH_PROMPT_SELECT =
  'id, kind, status, title, recipient_user_id, priority, task_kind, due_at'

const DISPATCH_FEED_SELECT =
  'id, club_id, sender_user_id, recipient_user_id, kind, status, title, body, source, source_channel, context_json, insight_key, task_kind, priority, due_at, deep_link, period_year, period_month, series_id, recurrence_interval, recurrence_unit, stages_json, created_at, updated_at, seen_at, accepted_at, completed_at, declined_at, recipient_reply'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string[]} userIds
 */
async function loadUserNames(supabaseAdmin, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const { data } = await supabaseAdmin.from('users').select('id, name').in('id', ids)
  return new Map((data ?? []).map((u) => [String(u.id), String(u.name ?? '').trim()]))
}

function isMissingDispatchTable(error) {
  return /does not exist|relation.*club_iskra_dispatch/i.test(String(error?.message ?? ''))
}

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
    if (isMissingDispatchTable(error)) {
      return []
    }
    throw error
  }
  return compactOpenDispatchForPrompt(data ?? [])
}

/**
 * Лента Планёрки для панели ИСКРЫ: активные + недавно выполненные.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 */
export async function loadClubPlanerkaFeed(supabaseAdmin, clubId) {
  const id = String(clubId ?? '').trim()
  if (!id) return buildPlanerkaFeedPayload([])

  const activeRes = await supabaseAdmin
    .from('club_iskra_dispatch')
    .select(DISPATCH_FEED_SELECT)
    .eq('club_id', id)
    .in('status', [...ISKRA_DISPATCH_ACTIVE_STATUSES])
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(8)

  if (activeRes.error) {
    if (isMissingDispatchTable(activeRes.error)) {
      return buildPlanerkaFeedPayload([])
    }
    throw activeRes.error
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const doneRes = await supabaseAdmin
    .from('club_iskra_dispatch')
    .select(DISPATCH_FEED_SELECT)
    .eq('club_id', id)
    .eq('status', 'done')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(3)

  if (doneRes.error && !isMissingDispatchTable(doneRes.error)) {
    throw doneRes.error
  }

  const rows = [...(activeRes.data ?? []), ...(doneRes.data ?? [])]
  const names = await loadUserNames(
    supabaseAdmin,
    rows.flatMap((r) => [r.sender_user_id, r.recipient_user_id]),
  )
  const formatted = rows.map((r) =>
    formatDispatchForUi({
      ...r,
      sender_name: names.get(String(r.sender_user_id)) || 'ИСКРА',
      recipient_name: names.get(String(r.recipient_user_id)) || '',
    }),
  )

  return buildPlanerkaFeedPayload(formatted, { limit: 8 })
}
