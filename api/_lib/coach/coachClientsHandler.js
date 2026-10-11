/**
 * Клиенты на телефоне тренера: GET /api/coach?view=clients.
 * Только свои клиенты (trainer_id = вход), только «Активные» (ПЗ не закрыт, не архив клуба).
 * Телефон клиента уходит на телефон тренера — осознанно (docs/COACH_APP.md), на устройстве не хранится.
 */
import { addCalendarDaysIso, todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { sendJson } from '../adminSupabase.js'
import { loadInChunks } from '../batchCore.js'
import {
  COACH_CLIENT_FIELDS,
  COACH_LAST_TRAINING_DAYS,
  COACH_MEMBERSHIP_FIELDS,
  buildCoachClients,
} from './coachClientsCore.js'

const PAGE = 1000
const ID_CHUNK = 100

/** Все строки запроса страницами: лимит ответа БД не режет список молча. */
async function pagedRows(makeQuery) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

export async function loadCoachClientsRows(db, trainerId, today) {
  const clients = await pagedRows(() =>
    db.from('clients').select(COACH_CLIENT_FIELDS).eq('trainer_id', trainerId).is('archived_at', null).order('id'),
  )
  const ids = clients.map((c) => String(c.id))
  const since = addCalendarDaysIso(today, -COACH_LAST_TRAINING_DAYS)
  const [memberships, lifecycleRows, trainings] = await Promise.all([
    loadInChunks(ids, (part) => pagedRows(() => db.from('memberships').select(COACH_MEMBERSHIP_FIELDS).in('client_id', part).order('id')), ID_CHUNK),
    loadInChunks(ids, (part) => pagedRows(() => db.from('client_hall_lifecycle').select('client_id, hall, closed_at').in('client_id', part).order('client_id')), ID_CHUNK),
    pagedRows(() =>
      db
        .from('trainings')
        .select('client_id, date, status')
        .eq('trainer_id', trainerId)
        .eq('status', 'completed')
        .gte('date', since)
        .order('id'),
    ),
  ])
  const typeIds = [...new Set(memberships.map((m) => String(m.membership_type_id ?? '')).filter(Boolean))]
  const types = await loadInChunks(typeIds, (part) => pagedRows(() => db.from('membership_types').select('id, code').in('id', part).order('id')), ID_CHUNK)
  const typeCodeById = Object.fromEntries(types.map((t) => [String(t.id), String(t.code ?? '')]))
  return { clients, memberships, lifecycleRows, trainings, typeCodeById }
}

export async function sendCoachClients(ctx, res) {
  const trainerId = String(ctx.user.id)
  const today = todayInTimeZoneIso()
  const data = await loadCoachClientsRows(ctx.supabaseAdmin, trainerId, today)
  sendJson(res, 200, { today, clients: buildCoachClients({ trainerId, ...data }) })
}
