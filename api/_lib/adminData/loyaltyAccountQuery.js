/**
 * Загрузка строк лояльности из Postgres (service role). Без правил баланса.
 */

import { CLUB_OPS_TIMEZONE, todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { loyaltyRatesFromSettings, normalizeLoyaltySettings } from '../../../src/lib/loyalty/loyaltySettingsCore.js'
import { shouldInsertLoyaltyCycleOpen } from '../../../src/lib/loyalty/loyaltyAccountCore.js'

const TRAININGS_PAGE = 500

export function isLoyaltyTableMissing(error) {
  const msg = String(error?.message ?? error ?? '')
  return /does not exist|schema cache|club_loyalty_settings|loyalty_ledger/i.test(msg)
}

export function clubOpsAsOfIso(now = new Date()) {
  return todayInTimeZoneIso(CLUB_OPS_TIMEZONE, now)
}

export async function loadLoyaltySettingsRow(supabase, clubId) {
  const { data, error } = await supabase
    .from('club_loyalty_settings')
    .select(
      'club_id, enabled, enabled_at, enabled_intervals, cycle_months, points_per_week, kcal_chunk, points_per_kcal_chunk, max_minutes, max_kcal_per_training, updated_at',
    )
    .eq('club_id', clubId)
    .maybeSingle()
  if (error) throw error
  return normalizeLoyaltySettings(data ?? { enabled: false })
}

export async function loadLoyaltyClientRow(supabase, clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, club_id, trainer_id, archived_at')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function loadLoyaltyMemberships(supabase, clientId) {
  const { data, error } = await supabase.from('memberships').select('*').eq('client_id', clientId)
  if (error) throw error
  return data ?? []
}

export async function loadLoyaltyMembershipTypes(supabase, clubId) {
  const { data, error } = await supabase.from('membership_types').select('*').eq('club_id', clubId)
  if (error) throw error
  return data ?? []
}

export async function loadLoyaltyLedger(supabase, clubId, clientId) {
  const { data, error } = await supabase
    .from('loyalty_ledger')
    .select('id, club_id, client_id, kind, at, points, comment, actor_id, snapshot, payload, created_at')
    .eq('club_id', clubId)
    .eq('client_id', clientId)
    .order('at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function loadLoyaltyCompletedTrainings(supabase, clientId, fromDate) {
  const start = String(fromDate ?? '1900-01-01').slice(0, 10) || '1900-01-01'
  const out = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('trainings')
      .select('id, date, status, type, data, created_at, client_id, club_id')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .gte('date', start)
      .order('date', { ascending: true })
      .range(from, from + TRAININGS_PAGE - 1)
    if (error) throw error
    const chunk = data ?? []
    out.push(...chunk)
    if (chunk.length < TRAININGS_PAGE) break
    from += TRAININGS_PAGE
  }
  return out
}

export async function upsertLoyaltySettingsRow(supabase, row) {
  const { data, error } = await supabase
    .from('club_loyalty_settings')
    .upsert(row, { onConflict: 'club_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function insertLoyaltyLedgerRow(supabase, row) {
  const { data, error } = await supabase.from('loyalty_ledger').insert(row).select().single()
  if (error) throw error
  return data
}

export async function maybeInsertCycleOpen(supabase, { clubId, clientId, snapshot, ledger, settings }) {
  if (!shouldInsertLoyaltyCycleOpen(snapshot, ledger)) return ledger
  const row = {
    club_id: clubId,
    client_id: clientId,
    kind: 'cycle_open',
    at: new Date().toISOString(),
    snapshot: loyaltyRatesFromSettings(settings),
    payload: { cycle_start: snapshot.cycle_start },
  }
  const { error } = await supabase.from('loyalty_ledger').insert(row)
  if (error) {
    const dup = String(error.code ?? '') === '23505' || /duplicate|unique/i.test(String(error.message ?? ''))
    if (!dup) throw error
  }
  return loadLoyaltyLedger(supabase, clubId, clientId)
}

export async function loadLoyaltyAccountBundle(supabase, { clientId, clubId, clientRow, settings, types }) {
  const enabledAt = settings.enabled_at || '1900-01-01'
  const [memberships, ledger, trainings] = await Promise.all([
    loadLoyaltyMemberships(supabase, clientId),
    loadLoyaltyLedger(supabase, clubId, clientId),
    loadLoyaltyCompletedTrainings(supabase, clientId, enabledAt),
  ])
  return {
    as_of: clubOpsAsOfIso(),
    client_id: clientId,
    club_id: clubId,
    archived_at: clientRow?.archived_at ?? null,
    settings,
    trainings,
    memberships,
    membership_types: types,
    ledger,
  }
}
