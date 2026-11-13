/**
 * Узкий select и разбор updated_since для admin list-clients / list-memberships (CAPACITY A2).
 */

/** Поля списка клиентов (не select('*'); карточку догружает get-client). */
export const LIST_CLIENTS_SELECT = [
  'id',
  'club_id',
  'name',
  'phone',
  'email',
  'birth_date',
  'card_number',
  'trainer_id',
  'archived_at',
  'archive_reason',
  'archive_reason_at',
  'expected_return_on',
  'desk_hall',
  'outreach_name',
  'max_chat_url',
  'trainer_chat_since',
  'lifecycle',
  'pnk_stage',
  'pnk_source',
  'pnk_trial_date',
  'pnk_trial_time',
  'pnk_comment',
  'pnk_comments',
  'pnk_deliverables',
  'pnk_won_at',
  'pnk_lost_at',
  'pnk_lost_reason',
  'pnk_created_at',
  'created_at',
  'updated_at',
].join(',')

/** Поля списка абонементов клуба. */
export const LIST_MEMBERSHIPS_SELECT = [
  'id',
  'client_id',
  'club_id',
  'start_date',
  'end_date',
  'total_trainings',
  'used_trainings',
  'status',
  'membership_type_id',
  'paid_amount',
  'session_visits',
  'hall',
  'duration_unit',
  'duration_count',
  'created_at',
  'updated_at',
].join(',')

/**
 * @param {unknown} raw
 * @returns {{ ok: true, since: string | null } | { ok: false, error: string }}
 */
export function parseUpdatedSinceQuery(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { ok: true, since: null }
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) {
    return { ok: false, error: 'updated_since должен быть датой ISO' }
  }
  return { ok: true, since: new Date(ms).toISOString() }
}
