/**
 * Подменные /api/client-auth и /api/client-me. Ответ собирают те же чистые функции, что и сервер,
 * поэтому форма данных /me в тесте не расходится с продом.
 */
import { randomUUID } from 'node:crypto'
import { CLIENT_INVITE_BAD_RU } from '../../../api/_lib/clientPortal/clientAuthCore.js'
import {
  buildClientMemberships,
  buildClientProgress,
  pickNextClientSession,
} from '../../../api/_lib/clientPortal/clientMeCore.js'
import { cleanClubName, clientManifestUrl } from '../../../api/_lib/clientPortal/clientManifestCore.js'
import { buildClientTrainingView } from '../../../api/_lib/clientPortal/clientTrainingViewCore.js'
import {
  PROGRESS_SELF_SOURCE,
  measureValuesToRow,
  parseSelfMeasureValues,
  parseSelfProgressDate,
  parseSelfWeightKg,
} from '../../../src/lib/client/clientProgressSelfCore.js'
import { sanitizeClientPlanPayload, summarizeClientPlan } from '../../../src/lib/clientPlans/clientPlanCore.js'
import { fakeJwt } from './fakeBackend.mjs'

/**
 * @param {object} state состояние fakeBackend
 * @param {{ clientId: string, inviteToken: string, today: string, schedule?: object[] }} opts
 */
export function createFakeClientPortal(state, { clientId, inviteToken, today, schedule = [] }) {
  let redeemed = false
  const session = () => ({
    access_token: fakeJwt({ sub: clientId, aud: 'client', typ: 'client' }),
    refresh_token: `client-refresh-${clientId}`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })

  return ({ method, path, headers, body }) => {
    if (path === '/api/client-auth') {
      if (body?.action === 'redeem') {
        if (body.token !== inviteToken || redeemed) return { status: 401, json: { error: CLIENT_INVITE_BAD_RU } }
        redeemed = true
        ;(state.client_sessions ??= []).push({ client_id: clientId, revoked_at: null })
        const client = state.clients.find((c) => c.id === clientId)
        return { status: 200, json: { session: session(), client: { name: client.name } } }
      }
      if (body?.action === 'refresh') return { status: 200, json: { session: session() } }
      return { status: 200, json: { ok: true } }
    }
    if (!/^Bearer .+/.test(String(headers.authorization ?? ''))) return { status: 401, json: { error: 'Нет сессии' } }
    const trainings = state.trainings.filter((t) => t.client_id === clientId && t.status === 'completed')
    const names = new Map(state.users.map((u) => [u.id, u.name]))
    if (method !== 'GET' && body?.action === 'training') {
      const row = trainings.find((t) => t.id === body.id)
      if (!row) return { status: 404, json: { error: 'Тренировка не найдена' } }
      return { status: 200, json: { training: buildClientTrainingView(row, names.get(row.trainer_id) ?? null) } }
    }
    const plans = (state.client_plans ?? [])
      .filter((p) => p.client_id === clientId)
      .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
    const brief = (p) => ({
      id: p.id,
      kind: p.kind,
      sent_at: p.sent_at,
      trainer_name: names.get(p.sent_by) ?? null,
      seen: Boolean(p.client_seen_at),
      summary: summarizeClientPlan(p.kind, sanitizeClientPlanPayload(p.kind, p.payload)),
    })
    if (method !== 'GET' && body?.action === 'plan-list') {
      return { status: 200, json: { items: plans.filter((p) => p.kind === body.kind).map(brief) } }
    }
    if (method !== 'GET' && body?.action === 'plan-item') {
      const row = plans.find((p) => p.id === body.id)
      if (!row) return { status: 404, json: { error: 'Задание не найдено' } }
      row.client_seen_at ??= new Date().toISOString()
      return { status: 200, json: { item: { ...brief(row), payload: sanitizeClientPlanPayload(row.kind, row.payload) } } }
    }

    const weights = () => (state.client_weight_entries ?? []).filter((w) => w.client_id === clientId)
    const measures = () => (state.body_measurements ?? []).filter((m) => m.client_id === clientId)
    const memberships = () => state.memberships.filter((m) => m.client_id === clientId)
    const progressSlice = () => ({
      as_of: today,
      progress: buildClientProgress(trainings, weights(), measures(), today, memberships()),
    })

    if (method !== 'GET' && String(body?.action ?? '').startsWith('progress-')) {
      const action = String(body.action)
      if (action === 'progress-weight-upsert') {
        const d = parseSelfProgressDate(body.date, today)
        if (!d.ok) return { status: 400, json: { error: d.error } }
        const k = parseSelfWeightKg(body.kg)
        if (!k.ok) return { status: 400, json: { error: k.error } }
        state.client_weight_entries ??= []
        const id = String(body.id ?? '').trim()
        if (id) {
          const row = state.client_weight_entries.find((w) => w.id === id && w.client_id === clientId)
          if (!row) return { status: 404, json: { error: 'Запись не найдена' } }
          if (row.source !== PROGRESS_SELF_SOURCE) return { status: 403, json: { error: 'Эту точку внёс клуб — менять нельзя' } }
          row.date = d.date
          row.weight_kg = k.kg
          return { status: 200, json: { ok: true, id, ...progressSlice() } }
        }
        const same = state.client_weight_entries.find(
          (w) => w.client_id === clientId && w.source === PROGRESS_SELF_SOURCE && w.date === d.date,
        )
        if (same) {
          same.weight_kg = k.kg
          return { status: 200, json: { ok: true, id: same.id, ...progressSlice() } }
        }
        const newId = randomUUID()
        state.client_weight_entries.push({
          id: newId,
          client_id: clientId,
          date: d.date,
          weight_kg: k.kg,
          source: PROGRESS_SELF_SOURCE,
        })
        return { status: 200, json: { ok: true, id: newId, ...progressSlice() } }
      }
      if (action === 'progress-weight-delete') {
        const id = String(body.id ?? '').trim()
        const row = (state.client_weight_entries ?? []).find((w) => w.id === id && w.client_id === clientId)
        if (!row) return { status: 404, json: { error: 'Запись не найдена' } }
        if (row.source !== PROGRESS_SELF_SOURCE) return { status: 403, json: { error: 'Эту точку внёс клуб — удалять нельзя' } }
        state.client_weight_entries = state.client_weight_entries.filter((w) => w.id !== id)
        return { status: 200, json: { ok: true, ...progressSlice() } }
      }
      if (action === 'progress-measure-upsert') {
        const d = parseSelfProgressDate(body.date, today)
        if (!d.ok) return { status: 400, json: { error: d.error } }
        const v = parseSelfMeasureValues(body.values)
        if (!v.ok) return { status: 400, json: { error: v.error } }
        state.body_measurements ??= []
        const cols = measureValuesToRow(v.values)
        const id = String(body.id ?? '').trim()
        if (id) {
          const row = state.body_measurements.find((m) => m.id === id && m.client_id === clientId)
          if (!row) return { status: 404, json: { error: 'Замер не найден' } }
          if (row.source !== PROGRESS_SELF_SOURCE) return { status: 403, json: { error: 'Этот замер внёс клуб — менять нельзя' } }
          Object.assign(row, cols, { date: d.date, source: PROGRESS_SELF_SOURCE })
          return { status: 200, json: { ok: true, id, ...progressSlice() } }
        }
        const newId = randomUUID()
        state.body_measurements.push({ id: newId, client_id: clientId, date: d.date, source: PROGRESS_SELF_SOURCE, ...cols })
        return { status: 200, json: { ok: true, id: newId, ...progressSlice() } }
      }
      if (action === 'progress-measure-delete') {
        const id = String(body.id ?? '').trim()
        const row = (state.body_measurements ?? []).find((m) => m.id === id && m.client_id === clientId)
        if (!row) return { status: 404, json: { error: 'Замер не найден' } }
        if (row.source !== PROGRESS_SELF_SOURCE) return { status: 403, json: { error: 'Этот замер внёс клуб — удалять нельзя' } }
        state.body_measurements = state.body_measurements.filter((m) => m.id !== id)
        return { status: 200, json: { ok: true, ...progressSlice() } }
      }
      return { status: 400, json: { error: 'Неизвестное действие' } }
    }

    if (method !== 'GET') return { status: 200, json: { ok: true } }

    const client = state.clients.find((c) => c.id === clientId)
    const club = state.clubs.find((c) => c.id === client.club_id)
    return {
      status: 200,
      json: {
        as_of: today,
        client: { name: client.name },
        club: { name: cleanClubName(club?.name), manifest_url: clientManifestUrl(client.club_id) },
        memberships: buildClientMemberships(
          memberships(),
          state.membership_types,
          trainings,
          today,
          names,
        ),
        next_session: pickNextClientSession(schedule, today, 0, names),
        progress: progressSlice().progress,
        loyalty: null,
        plans: {
          homework: plans.find((p) => p.kind === 'homework') ? brief(plans.find((p) => p.kind === 'homework')) : null,
          nutrition: plans.find((p) => p.kind === 'nutrition') ? brief(plans.find((p) => p.kind === 'nutrition')) : null,
        },
      },
    }
  }
}
