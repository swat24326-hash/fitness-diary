/**
 * Удаление переписки клиентов, которые больше 90 дней в архиве (cron на ВМ раз в сутки: scripts/chat-retention-vm.mjs).
 * Удаляем диалоги — сообщения уходят каскадом. Личная переписка сотрудников не трогается.
 */
import { CHAT_ARCHIVE_KEEP_DAYS, chatRetentionCutoffIso } from '../../../src/lib/chat/chatRetentionCore.js'
import { loadInChunks } from '../batchCore.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { rows } from '../inbox/inboxStore.js'
import { isMissingChatTable } from './chatStore.js'

/**
 * @param {{ db?: object, now?: Date, dryRun?: boolean }} [opts]
 * dryRun — только посчитать, сколько диалогов ушло бы сейчас.
 */
export async function runChatRetention({ db = createServiceDataClient(), now = new Date(), dryRun = false } = {}) {
  const cutoff = chatRetentionCutoffIso(now)
  const clients = await rows(db.from('clients').select('id').lt('archived_at', cutoff))
  const clientIds = clients.map((c) => String(c.id))
  let threads
  try {
    threads = await loadInChunks(clientIds, (part) => rows(db.from('chat_threads').select('id').in('client_id', part)))
  } catch (e) {
    if (isMissingChatTable(e)) return { skipped: 'migration_pending' }
    throw e
  }
  const ids = threads.map((t) => String(t.id))
  const result = { keep_days: CHAT_ARCHIVE_KEEP_DAYS, cutoff, threads: ids.length }
  if (dryRun || !ids.length) return { ...result, dry_run: dryRun, deleted: 0 }
  const deleted = await loadInChunks(ids, (part) => rows(db.from('chat_threads').delete().in('id', part).select('id')))
  return { ...result, deleted: deleted.length }
}
