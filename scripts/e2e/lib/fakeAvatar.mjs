/**
 * Фото профиля в автотестах экрана: настоящий avatarOp сервера поверх state фейкового бэкенда,
 * файлы — в памяти (CHAT_VOICE_STORAGE=memory). Отдача файла — как GET /api/me-profile?avatar=.
 */
import { avatarOp, isAvatarAction } from '../../../api/_lib/profile/avatarHandler.js'
import { getVoice } from '../../../api/_lib/chat/chatVoiceStorage.js'
import { avatarMimeOf, isAvatarKey } from '../../../src/lib/profile/avatarCore.js'

/** Мини-клиент БД: select(...).eq().maybeSingle() и update().eq() по массиву строк. */
function fakeDb(state) {
  return {
    from(table) {
      const rows = state[table]
      return {
        select: () => ({
          eq: (_col, id) => ({ maybeSingle: async () => ({ data: rows.find((r) => r.id === id) ?? null, error: null }) }),
        }),
        update: (patch) => ({
          eq: async (_col, id) => {
            const row = rows.find((r) => r.id === id)
            if (row) Object.assign(row, patch)
            return { error: null }
          },
        }),
      }
    },
  }
}

const answer = (out) => ({ status: out.status, json: out.body })

/** Подключает фото к backend: клиент (/api/client-me), сотрудник (/api/me-profile, /api/coach). */
export function wireAvatars(backend, { clientId = null } = {}) {
  process.env.CHAT_VOICE_STORAGE = 'memory'
  const db = fakeDb(backend.state)
  const clientMe = backend.clientMe
  if (clientMe && clientId) {
    backend.clientMe = (req) =>
      isAvatarAction(req.body?.action)
        ? avatarOp(db, { table: 'clients', side: 'client', id: clientId }, req.body.action.replace(/^avatar-/, ''), req.body).then(answer)
        : clientMe(req)
  }
  const handle = backend.handle
  backend.handle = async (req) => {
    if (req.path !== '/api/me-profile') return handle(req)
    const key = req.searchParams.get('avatar')
    if (req.method === 'GET' && key) {
      const bytes = isAvatarKey(key) ? await getVoice(key) : null
      return bytes ? { status: 200, file: bytes, contentType: avatarMimeOf(key) } : { status: 404, json: { error: 'Фото не найдено' } }
    }
    const res = await handle(req)
    if (req.method !== 'POST' || res?.status !== 200 || !isAvatarAction(req.body?.action)) return res
    const id = res.json?.profile?.id
    return answer(await avatarOp(db, { table: 'users', side: 'staff', id }, req.body.action.replace(/^avatar-/, ''), req.body))
  }
  return backend
}
