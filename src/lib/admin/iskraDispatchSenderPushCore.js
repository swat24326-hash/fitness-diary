/**
 * Push отправителю задания при смене статуса исполнителем.
 * scripts/verify-iskra-dispatch-sender-push.mjs
 */

/** @typedef {'accepted'|'done'} DispatchSenderPushStatus */

export const DISPATCH_SENDER_PUSH_STATUSES = /** @type {const} */ (['accepted', 'done'])

/**
 * @param {string | null | undefined} status
 */
export function shouldNotifySenderOnDispatchStatus(status) {
  return DISPATCH_SENDER_PUSH_STATUSES.includes(String(status ?? '').trim())
}

/**
 * @param {string} [title]
 */
export function shortenDispatchTitleForPush(title) {
  const t = String(title ?? '').trim() || 'Задание'
  return t.length > 72 ? `${t.slice(0, 69)}…` : t
}

/**
 * @param {{
 *   status: DispatchSenderPushStatus,
 *   dispatchId: string,
 *   clubId?: string,
 *   taskTitle?: string,
 *   recipientName?: string,
 * }} opts
 */
export function buildDispatchSenderStatusPushPayload(opts) {
  const status = String(opts.status ?? '').trim()
  if (!shouldNotifySenderOnDispatchStatus(status)) return null

  const recipientName = String(opts.recipientName ?? '').trim() || 'Сотрудник'
  const titleShort = shortenDispatchTitleForPush(opts.taskTitle)
  const clubId = String(opts.clubId ?? '').trim()
  const dispatchId = String(opts.dispatchId ?? '').trim()
  const clubQuery = clubId ? `?club=${encodeURIComponent(clubId)}` : ''

  if (status === 'accepted') {
    return {
      title: 'Задание принято',
      body: `${recipientName} принял: ${titleShort}`,
      url: `/admin/club-tasks${clubQuery}`,
      tag: `dispatch-sender-${dispatchId}-accepted`,
    }
  }

  return {
    title: 'Задание выполнено',
    body: `${recipientName} выполнил: ${titleShort}`,
    url: `/admin/club-tasks${clubQuery}`,
    tag: `dispatch-sender-${dispatchId}-done`,
  }
}

/**
 * @param {string | null | undefined} senderUserId
 * @param {string | null | undefined} recipientUserId
 */
export function shouldSkipSenderPush(senderUserId, recipientUserId) {
  const sender = String(senderUserId ?? '').trim()
  const recipient = String(recipientUserId ?? '').trim()
  if (!sender) return true
  if (sender && recipient && sender === recipient) return true
  return false
}
