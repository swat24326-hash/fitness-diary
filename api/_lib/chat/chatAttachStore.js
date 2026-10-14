/** Вложения сообщений в базе (service role): колонки attach_* (миграция 20261029120000) и поиск сообщения в своём диалоге. */
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'

/** Поля вложения в выборке ленты — для buildAttachView (ключ наружу не уходит, только признак «файл ещё есть»). */
export const ATTACH_FIELDS = 'attach_kind, attach_key, attach_mime, attach_bytes, attach_name, attach_w, attach_h, attach_caption'

/** attach — { kind, key, mime, bytes, name, w, h, caption } после загрузки в хранилище. */
export function attachColumns(attach) {
  if (!attach) return {}
  return {
    attach_kind: attach.kind,
    attach_key: attach.key,
    attach_mime: attach.mime,
    attach_bytes: attach.bytes,
    attach_name: attach.name,
    attach_w: attach.w,
    attach_h: attach.h,
    attach_caption: attach.caption || null,
  }
}

/** @param {'chat_messages' | 'staff_dm_messages' | 'staff_group_messages'} table — только в диалоге, к которому у человека есть доступ */
export async function loadAttachMessage(db, table, threadId, messageId) {
  if (!threadId || !isInboxUuid(messageId)) return null
  const { data, error } = await db
    .from(table)
    .select('id, created_at, attach_kind, attach_key, attach_mime, attach_name')
    .eq('thread_id', threadId)
    .eq('id', String(messageId).trim())
    .maybeSingle()
  if (error) throw error
  return data ?? null
}
