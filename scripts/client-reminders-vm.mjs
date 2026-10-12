/**
 * Напоминания клиентам о завтрашней тренировке. Запускает cron на ВМ (scripts/client-reminders-install-vm.sh)
 * каждые 15 минут; окно 19:00–22:00 по часам клуба и журнал без дублей проверяет сам код.
 * Заодно — push о задании / рационе от тренера, отправленных в тихие часы (утром после 9:00).
 * Вручную на ВМ: sudo bash scripts/client-reminders-vm.sh [--dry-run]
 */
import { runClientReminders } from '../api/_lib/clientPortal/clientReminderJob.js'
import { runClientPlanNotices } from '../api/_lib/clientPlans/clientPlanNotify.js'
import { createServiceDataClient } from '../api/_lib/pgRest/serviceClient.js'

let failed = false
try {
  const result = await runClientReminders({ dryRun: process.argv.includes('--dry-run') })
  if (!result.skipped) console.log('client-reminders:', JSON.stringify(result))
} catch (e) {
  failed = true
  console.error('client-reminders: ошибка', e?.code || '', e?.message || e)
}
if (!process.argv.includes('--dry-run')) {
  try {
    const notices = await runClientPlanNotices({ db: createServiceDataClient() })
    if (!notices.skipped && notices.pending) console.log('client-plan-notices:', JSON.stringify(notices))
  } catch (e) {
    failed = true
    console.error('client-plan-notices: ошибка', e?.code || '', e?.message || e)
  }
}
process.exit(failed ? 1 : 0)
