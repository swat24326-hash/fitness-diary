/** Разбор view / op / action группы АЗ — общий для /api/coach, admin-data?action=chat и /api/client-me. */
import { sendJson } from '../adminSupabase.js'
import {
  muteAzGroup,
  muteClientAzGroup,
  reactAzGroupMessage,
  reactClientAzGroupMessage,
  sendAzGroupMessage,
  sendAzGroupSearch,
  sendAzGroupThread,
  sendAzGroupVoice,
  sendClientAzGroupMessage,
  sendClientAzGroupSearch,
  sendClientAzGroupThread,
  sendClientAzGroupVoice,
} from './azGroupHandler.js'
import { azGroupsAttention, clientAzGroupsAttention, sendClientAzGroupList } from './azGroupList.js'
import { pinAzGroupMessage, pinClientAzGroupMessage, sendAzGroupReaders, sendClientAzGroupReaders } from './azGroupPinHandler.js'

export { azGroupsAttention, clientAzGroupsAttention }

const requested = (query) => query?.instructor_user_id

export function handleAzGroupGet(ctx, res, view, query) {
  const id = requested(query)
  if (view === 'az-group-thread') return sendAzGroupThread(ctx, res, query.before, query.seen, id)
  if (view === 'az-group-search') return sendAzGroupSearch(ctx, res, query.q, id)
  if (view === 'az-group-readers') return sendAzGroupReaders(ctx, res, query.message_id, id)
  sendJson(res, 400, { error: 'Неизвестный запрос' })
}

export function handleAzGroupPost(ctx, res, op, body) {
  const id = body?.instructor_user_id
  if (op === 'az-group-send') return sendAzGroupMessage(ctx, res, body, id)
  if (op === 'az-group-react') return reactAzGroupMessage(ctx, res, body, id)
  if (op === 'az-group-mute') return muteAzGroup(ctx, res, body?.muted, id)
  if (op === 'az-group-pin') return pinAzGroupMessage(ctx, res, body?.message_id ?? null, id)
  if (op === 'az-group-voice-audio' || op === 'az-group-voice-text') {
    return sendAzGroupVoice(ctx, res, body?.message_id, op === 'az-group-voice-text' ? 'text' : 'audio', id)
  }
  if (op === 'az-group-attach') return sendAzGroupVoice(ctx, res, body?.message_id, 'file', id)
  sendJson(res, 400, { error: 'Неизвестное действие' })
}

/** POST /api/client-me { action: 'az-group-*', instructor_user_id }. Список — без инструктора. */
export function handleClientAzGroupPost(db, ctx, body, res) {
  const action = String(body?.action ?? '')
  const client = ctx.client
  const id = body?.instructor_user_id
  if (action === 'az-group-list') return sendClientAzGroupList(db, client, res)
  if (action === 'az-group-thread') return sendClientAzGroupThread(db, client, res, id, body?.before, body?.seen)
  if (action === 'az-group-search') return sendClientAzGroupSearch(db, client, res, id, body?.q)
  if (action === 'az-group-readers') return sendClientAzGroupReaders(db, client, res, id, body?.message_id)
  if (action === 'az-group-send') return sendClientAzGroupMessage(db, client, res, id, body)
  if (action === 'az-group-react') return reactClientAzGroupMessage(db, client, res, id, body)
  if (action === 'az-group-mute') return muteClientAzGroup(db, client, res, id, body?.muted)
  if (action === 'az-group-pin') return pinClientAzGroupMessage(db, client, res, id, body?.message_id ?? null)
  if (action === 'az-group-voice-audio' || action === 'az-group-voice-text' || action === 'az-group-attach') {
    const want = action === 'az-group-voice-text' ? 'text' : action === 'az-group-attach' ? 'file' : 'audio'
    return sendClientAzGroupVoice(db, client, res, id, body?.message_id, want)
  }
  sendJson(res, 400, { error: 'Неизвестное действие' })
}
