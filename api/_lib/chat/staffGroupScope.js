/** Чат клуба: кто открывает, чей клуб и кто участники — общее для ленты, закрепа и «Кто прочитал». */
import { sendJson } from '../adminSupabase.js'
import { STAFF_GROUP_UNAVAILABLE_RU, pickStaffGroupMembers, staffGroupClubFor } from '../../../src/lib/chat/staffGroupCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { loadLinkedStaffView, staffDmCtx } from './linkedStaffStore.js'
import { loadClubStaff } from './staffDmStore.js'
import { isMissingGroupTable, loadClubName } from './staffGroupStore.js'

export const viewerOf = (ctx) => ({ id: String(ctx.user?.id ?? ''), role: ctx.profile?.role, club_id: ctx.profile?.club_id })

export async function withGroupTable(res, fn) {
  try {
    await fn()
  } catch (e) {
    if (!isMissingGroupTable(e)) throw e
    sendJson(res, 503, { error: STAFF_GROUP_UNAVAILABLE_RU })
  }
}

/** Кто открывает и чей чат; null — ответ (403 / 404) уже отправлен. */
export async function groupScope(authCtx, res, requestedClubId) {
  const ctx = await staffDmCtx(authCtx)
  const viewer = viewerOf(ctx)
  const club = staffGroupClubFor(viewer, requestedClubId)
  if (!club.ok) {
    sendJson(res, club.status, { error: club.error })
    return null
  }
  const db = ctx.supabaseAdmin
  const clubName = isInboxUuid(club.clubId) ? await loadClubName(db, club.clubId) : null
  if (clubName == null) {
    sendJson(res, 404, { error: 'Клуб не найден' })
    return null
  }
  return { ctx, db, viewer, clubId: club.clubId, clubName }
}

export async function loadMembers(db, clubId) {
  const [staff, { hidden }] = await Promise.all([loadClubStaff(db, clubId), loadLinkedStaffView(db, clubId)])
  return pickStaffGroupMembers(staff, clubId, hidden)
}
