/**
 * Подменные /api/client-auth и /api/client-me. Ответ собирают те же чистые функции, что и сервер,
 * поэтому форма данных /me в тесте не расходится с продом.
 */
import { CLIENT_INVITE_BAD_RU } from '../../../api/_lib/clientPortal/clientAuthCore.js'
import {
  buildClientMemberships,
  buildClientProgress,
  pickNextClientSession,
} from '../../../api/_lib/clientPortal/clientMeCore.js'
import { cleanClubName, clientManifestUrl } from '../../../api/_lib/clientPortal/clientManifestCore.js'
import { buildClientTrainingView } from '../../../api/_lib/clientPortal/clientTrainingViewCore.js'
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
          state.memberships.filter((m) => m.client_id === clientId),
          state.membership_types,
          trainings,
          today,
          names,
        ),
        next_session: pickNextClientSession(schedule, today, 0, names),
        progress: buildClientProgress(trainings, [], [], today),
        loyalty: null,
      },
    }
  }
}
