/**
 * Автоопрос во «Входящие»: опрос с триггером (сейчас — «после 10-й тренировки») приходит каждому клиенту,
 * чья N-я завершённая тренировка случилась после создания опроса, пока опрос не закрыт. Канон: docs/INBOX.md. Без React / IDB.
 */

export const INBOX_TRIGGERS = Object.freeze({ trainings_10: { trainings: 10, label: 'после 10-й тренировки' } })

/** Списание (неявка) — не визит, в счёт тренировок не идёт. */
const WRITE_OFF_TYPE = 'Списание'

/** @returns {'trainings_10'|null} */
export function normalizeInboxTrigger(raw) {
  const key = String(raw ?? '').trim()
  return Object.hasOwn(INBOX_TRIGGERS, key) ? /** @type {'trainings_10'} */ (key) : null
}

/** Запись из push может довести клиента до рубежа: завершённая тренировка, не списание. */
export function isMilestoneTrainingRow(row) {
  return Boolean(row?.client_id) && row?.status === 'completed' && row?.type !== WRITE_OFF_TYPE
}

/**
 * Дата N-й завершённой тренировки клиента (YYYY-MM-DD) или null, если их меньше N.
 * @param {Array<{ date?: string, status?: string, type?: string }>} trainings
 */
export function nthTrainingDate(trainings, n) {
  const dates = (trainings ?? [])
    .filter((t) => t?.status === 'completed' && t?.type !== WRITE_OFF_TYPE && t?.date)
    .map((t) => String(t.date).slice(0, 10))
    .sort()
  return dates.length >= n ? dates[n - 1] : null
}

/**
 * Какие автоопросы положены клиенту сейчас.
 * @param {{ campaigns: object[], trainings: object[], clubId: string, deliveredIds: Iterable<string> }} p
 * @returns {object[]}
 */
export function pickMilestoneCampaigns({ campaigns, trainings, clubId, deliveredIds }) {
  const club = String(clubId ?? '').trim()
  if (!club) return []
  const delivered = new Set([...(deliveredIds ?? [])].map(String))
  return (campaigns ?? []).filter((c) => {
    const trigger = INBOX_TRIGGERS[normalizeInboxTrigger(c?.trigger)]
    if (!trigger || c.closed_at || c.kind !== 'survey' || delivered.has(String(c.id))) return false
    if (!(c.club_ids ?? []).map(String).includes(club)) return false
    const reached = nthTrainingDate(trainings, trigger.trainings)
    return Boolean(reached) && reached >= String(c.created_at ?? '').slice(0, 10)
  })
}
