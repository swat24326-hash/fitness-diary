/**
 * Срок хранения переписки клиента: 90 дней после ухода в архив — диалоги удаляются целиком.
 * Вернулся раньше (archived_at снят) — всё на месте. Личная переписка сотрудников сюда не относится.
 */
export const CHAT_ARCHIVE_KEEP_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

/** Клиенты, ушедшие в архив раньше этого момента, теряют переписку. */
export function chatRetentionCutoffIso(now = new Date()) {
  return new Date(now.getTime() - CHAT_ARCHIVE_KEEP_DAYS * DAY_MS).toISOString()
}

export function isChatExpired(client, now = new Date()) {
  const at = Date.parse(String(client?.archived_at ?? ''))
  return Number.isFinite(at) && at < now.getTime() - CHAT_ARCHIVE_KEEP_DAYS * DAY_MS
}

/** Дата, когда переписка архивного клиента будет удалена (YYYY-MM-DD); не в архиве — null. */
export function chatDeleteOnIso(client) {
  const at = Date.parse(String(client?.archived_at ?? ''))
  if (!Number.isFinite(at)) return null
  return new Date(at + CHAT_ARCHIVE_KEEP_DAYS * DAY_MS).toISOString().slice(0, 10)
}
