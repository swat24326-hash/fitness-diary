/**
 * Нормализация JSON `/api/trainer-pull` для кэша на планшете.
 * Без React / IDB — чтобы verify ловил «забыли прокинуть поле».
 */

/**
 * @param {unknown} data
 * @returns {{
 *   clients: object[],
 *   memberships: object[],
 *   health_cards: object[],
 *   body_measurements: object[],
 *   client_weight_entries: object[],
 *   trainings: object[],
 *   pnk_funnel_events: object[],
 *   sale_clips: object[],
 *   client_hall_lifecycle: object[],
 *   trainer_schedule_entries: object[],
 *   club_id: string|null,
 *   outreach_templates: unknown,
 *   trainings_truncated: boolean,
 *   body_measurements_truncated: boolean,
 *   weight_entries_truncated: boolean,
 *   measurements_since: string|null,
 *   weight_entries_since: string|null,
 *   trainings_since: string|null,
 *   incremental: boolean,
 * } | null}
 */
export function normalizeTrainerPullPayload(data) {
  if (!data || typeof data !== 'object') return null
  const d = /** @type {Record<string, unknown>} */ (data)
  return {
    clients: Array.isArray(d.clients) ? d.clients : [],
    memberships: Array.isArray(d.memberships) ? d.memberships : [],
    health_cards: Array.isArray(d.health_cards) ? d.health_cards : [],
    body_measurements: Array.isArray(d.body_measurements) ? d.body_measurements : [],
    client_weight_entries: Array.isArray(d.client_weight_entries) ? d.client_weight_entries : [],
    trainings: Array.isArray(d.trainings) ? d.trainings : [],
    pnk_funnel_events: Array.isArray(d.pnk_funnel_events) ? d.pnk_funnel_events : [],
    sale_clips: Array.isArray(d.sale_clips) ? d.sale_clips : [],
    client_hall_lifecycle: Array.isArray(d.client_hall_lifecycle) ? d.client_hall_lifecycle : [],
    trainer_schedule_entries: Array.isArray(d.trainer_schedule_entries) ? d.trainer_schedule_entries : [],
    club_id: d.club_id != null && String(d.club_id).trim() ? String(d.club_id).trim() : null,
    outreach_templates: Object.prototype.hasOwnProperty.call(d, 'outreach_templates')
      ? d.outreach_templates
      : undefined,
    trainings_truncated: d.trainings_truncated === true,
    body_measurements_truncated: d.body_measurements_truncated === true,
    weight_entries_truncated: d.weight_entries_truncated === true,
    measurements_since: d.measurements_since != null ? String(d.measurements_since) : null,
    weight_entries_since: d.weight_entries_since != null ? String(d.weight_entries_since) : null,
    trainings_since: d.trainings_since ?? null,
    incremental: d.incremental === true,
  }
}
