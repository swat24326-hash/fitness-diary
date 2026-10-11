/**
 * Напоминания тренерам за 15 минут до записи Ежедневника. Запускает cron на ВМ (scripts/schedule-reminders-install-vm.sh)
 * каждые 5 минут; окно и журнал без дублей проверяет сам код.
 * Вручную на ВМ: sudo bash scripts/schedule-reminders-vm.sh [--dry-run]
 */
import { runScheduleReminders } from '../api/_lib/trainerSchedule/scheduleReminderJob.js'

try {
  const result = await runScheduleReminders({ dryRun: process.argv.includes('--dry-run') })
  if (!result.skipped || result.skipped === 'migration_pending') console.log('schedule-reminders:', JSON.stringify(result))
  process.exit(0)
} catch (e) {
  console.error('schedule-reminders: ошибка', e?.code || '', e?.message || e)
  process.exit(1)
}
