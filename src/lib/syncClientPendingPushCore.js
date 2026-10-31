/**
 * Гонка push: абонемент / lifecycle уходят в том же пакете, что insert клиента.
 * Пока клиента нет в облаке — это ожидание, не «нет доступа».
 */

export const CLIENT_PENDING_IN_CLOUD_PUSH_ERROR = 'Клиент пока не в облаке — повторите Sync'

/** @param {unknown} message */
export function isClientPendingInCloudPushError(message) {
  return String(message ?? '')
    .toLowerCase()
    .includes('клиент пока не в облаке')
}
