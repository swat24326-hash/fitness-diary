/** Разбор view / op чата клуба — общий для admin-data?action=chat и /api/coach (имена одинаковые). */
import { sendJson } from '../adminSupabase.js'
import {
  muteStaffGroup,
  reactStaffGroupMessage,
  sendStaffGroupMessage,
  sendStaffGroupSearch,
  sendStaffGroupThread,
  sendStaffGroupVoice,
} from './staffGroupHandler.js'
import { pinStaffGroupMessage, sendStaffGroupReaders } from './staffGroupPinHandler.js'

export { staffGroupsAttention } from './staffGroupHandler.js'

export function handleStaffGroupGet(ctx, res, view, query) {
  if (view === 'group-thread') return sendStaffGroupThread(ctx, res, query.club_id, query.before, query.seen)
  if (view === 'group-search') return sendStaffGroupSearch(ctx, res, query.club_id, query.q)
  if (view === 'group-readers') return sendStaffGroupReaders(ctx, res, query.club_id, query.message_id)
  sendJson(res, 400, { error: 'Неизвестный запрос' })
}

export function handleStaffGroupPost(ctx, res, op, body) {
  if (op === 'group-send') return sendStaffGroupMessage(ctx, res, body.club_id, body)
  if (op === 'group-react') return reactStaffGroupMessage(ctx, res, body.club_id, body)
  if (op === 'group-mute') return muteStaffGroup(ctx, res, body.club_id, body.muted)
  if (op === 'group-pin') return pinStaffGroupMessage(ctx, res, body.club_id, body.message_id ?? null)
  if (op === 'group-voice-audio' || op === 'group-voice-text') {
    return sendStaffGroupVoice(ctx, res, body.club_id, body.message_id, op === 'group-voice-text' ? 'text' : 'audio')
  }
  if (op === 'group-attach') return sendStaffGroupVoice(ctx, res, body.club_id, body.message_id, 'file')
  sendJson(res, 400, { error: 'Неизвестное действие' })
}
