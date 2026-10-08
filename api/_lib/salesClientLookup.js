/**
 * Кандидаты клиента клуба по карте / телефону — поиск в БД, не весь клуб в память.
 */
import {
  buildSalesCardIlikePattern,
  buildSalesPhoneIlikePattern,
  mergeClientRowsById,
} from '../../src/lib/admin/salesClientLookupCore.js'

const CANDIDATE_LIMIT = 200

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ clubId: string, cardNumber?: unknown, phone?: unknown, select: string, activeOnly?: boolean }} input
 * @returns {Promise<{ data: object[], error: { message?: string } | null }>}
 */
export async function fetchClubClientCandidates(supabaseAdmin, input) {
  const patterns = [
    ['card_number', buildSalesCardIlikePattern(input.cardNumber)],
    ['phone', buildSalesPhoneIlikePattern(input.phone)],
  ].filter(([, pattern]) => pattern)

  const results = await Promise.all(
    patterns.map(([column, pattern]) => {
      let q = supabaseAdmin.from('clients').select(input.select).eq('club_id', input.clubId).ilike(column, pattern)
      if (input.activeOnly) q = q.is('archived_at', null)
      return q.limit(CANDIDATE_LIMIT)
    }),
  )
  const failed = results.find((r) => r.error)
  if (failed) return { data: [], error: failed.error }
  return { data: mergeClientRowsById(results.map((r) => r.data ?? [])), error: null }
}
