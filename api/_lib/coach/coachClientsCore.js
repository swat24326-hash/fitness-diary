/**
 * Клиенты на телефоне тренера: чистая сборка ответа view=clients (без БД).
 * Только «Активные» тренера (как вкладка планшета), только поля для списка и шторки абонементов.
 */
import { isTrainerPzListActive } from '../../../src/lib/trainer/trainerClientsPzListCore.js'

export const COACH_CLIENT_FIELDS = 'id, name, phone, card_number, birth_date, lifecycle, max_chat_url, archived_at, trainer_id'
export const COACH_MEMBERSHIP_FIELDS = 'id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id'
export const COACH_LAST_TRAINING_DAYS = 365

const str = (v) => String(v ?? '').trim()

/**
 * @param {{
 *   trainerId: string,
 *   clients: object[],
 *   memberships: object[],
 *   lifecycleRows: object[],
 *   trainings: object[],
 *   typeCodeById: Record<string, string>,
 * }} input
 */
export function buildCoachClients({ trainerId, clients, memberships, lifecycleRows, trainings, typeCodeById }) {
  const own = (clients ?? []).filter(
    (c) => str(c?.id) && str(c?.trainer_id) === str(trainerId) && isTrainerPzListActive(c, lifecycleRows),
  )
  const ids = new Set(own.map((c) => str(c.id)))

  const lastByClient = {}
  for (const t of trainings ?? []) {
    const id = str(t?.client_id)
    const day = str(t?.date).slice(0, 10)
    if (!ids.has(id) || t?.status !== 'completed' || !day) continue
    if (!lastByClient[id] || day > lastByClient[id]) lastByClient[id] = day
  }

  const memByClient = {}
  for (const m of memberships ?? []) {
    const id = str(m?.client_id)
    if (!ids.has(id) || !str(m?.id)) continue
    const typeId = str(m.membership_type_id)
    ;(memByClient[id] ??= []).push({
      id: str(m.id),
      start_date: str(m.start_date).slice(0, 10),
      end_date: str(m.end_date).slice(0, 10),
      total_trainings: m.total_trainings ?? null,
      used_trainings: m.used_trainings ?? 0,
      membership_type_id: typeId || null,
      type_name: (typeId && typeCodeById?.[typeId]) || '',
    })
  }

  return own
    .map((c) => {
      const id = str(c.id)
      return {
        id,
        name: str(c.name),
        phone: str(c.phone),
        card_number: str(c.card_number),
        birth_date: str(c.birth_date).slice(0, 10) || null,
        lifecycle: str(c.lifecycle) || null,
        max_chat_url: str(c.max_chat_url),
        last_training_date: lastByClient[id] ?? null,
        memberships: (memByClient[id] ?? []).sort((a, b) => b.start_date.localeCompare(a.start_date)),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}
