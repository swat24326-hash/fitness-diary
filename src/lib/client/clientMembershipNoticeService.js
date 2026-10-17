/** POST /api/client-me { action: 'membership-notice-read' }. */
import { postClientMe } from './clientSession.js'

export async function markMembershipNoticeRead(id) {
  const noticeId = String(id ?? '').trim()
  if (!noticeId) throw new Error('Нет уведомления')
  const { notice } = await postClientMe({ action: 'membership-notice-read', id: noticeId })
  return notice
}
