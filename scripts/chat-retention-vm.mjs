/**
 * Удаление переписки клиентов, которые больше 90 дней в архиве. Запускает cron на ВМ раз в сутки
 * (scripts/chat-retention-install-vm.sh). Вручную на ВМ: sudo bash scripts/chat-retention-vm.sh [--dry-run]
 */
import { runChatRetention } from '../api/_lib/chat/chatRetentionJob.js'

try {
  console.log('chat-retention:', JSON.stringify(await runChatRetention({ dryRun: process.argv.includes('--dry-run') })))
  process.exit(0)
} catch (e) {
  console.error('chat-retention: ошибка', e?.code || '', e?.message || e)
  process.exit(1)
}
