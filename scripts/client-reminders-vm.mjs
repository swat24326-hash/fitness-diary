/**
 * Напоминания клиентам о завтрашней тренировке. Запускает cron на ВМ (scripts/client-reminders-install-vm.sh)
 * каждые 15 минут; окно 19:00–22:00 по часам клуба и журнал без дублей проверяет сам код.
 * Вручную на ВМ: sudo bash scripts/client-reminders-vm.sh [--dry-run]
 */
import { runClientReminders } from '../api/_lib/clientPortal/clientReminderJob.js'

try {
  const result = await runClientReminders({ dryRun: process.argv.includes('--dry-run') })
  if (!result.skipped) console.log('client-reminders:', JSON.stringify(result))
  process.exit(0)
} catch (e) {
  console.error('client-reminders: ошибка', e?.code || '', e?.message || e)
  process.exit(1)
}
