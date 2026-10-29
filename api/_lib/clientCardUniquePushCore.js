/**
 * Уникальность номера карты в клубе при push clients (до insert/update).
 * Индекс в БД на проде может отсутствовать (исторические дубли) — проверка в коде обязательна.
 */
import { fetchClubClientCandidates } from './salesClientLookup.js'
import {
  assertClubCardAvailableForCreate,
  normalizeSalesCardNumber,
} from '../../src/lib/admin/salesClientMatchCore.js'

const CARD_LOOKUP_SELECT = 'id, name, phone, card_number, club_id, trainer_id, archived_at, lifecycle'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{
 *   clubId?: string|null,
 *   cardNumber?: unknown,
 *   excludeClientId?: string|null,
 * }} opts
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string, client?: object }>}
 */
export async function assertClientCardUniqueForPush(supabaseAdmin, opts = {}) {
  const card = normalizeSalesCardNumber(opts.cardNumber)
  if (!card) return { ok: true }
  const clubId = String(opts.clubId ?? '').trim()
  if (!clubId) return { ok: true }

  const { data, error } = await fetchClubClientCandidates(supabaseAdmin, {
    clubId,
    cardNumber: card,
    select: CARD_LOOKUP_SELECT,
  })
  if (error) {
    return {
      ok: false,
      status: 503,
      error: 'Не удалось проверить номер карты — повторите Sync чуть позже',
    }
  }

  const check = assertClubCardAvailableForCreate(data, clubId, card, {
    excludeClientId: opts.excludeClientId,
  })
  if (check.ok) return { ok: true }
  return { ok: false, status: 400, error: check.error, client: check.client }
}

/**
 * Краткий снимок конфликта для ответа trainer-pull (без лишних полей).
 * @param {object|null|undefined} client
 */
export function publicCardConflictClient(client) {
  if (!client || typeof client !== 'object') return null
  return {
    id: String(client.id ?? '').trim() || null,
    name: String(client.name ?? '').trim() || null,
    card_number: String(client.card_number ?? '').trim() || null,
    archived_at: client.archived_at ?? null,
    trainer_id: client.trainer_id ?? null,
  }
}
