/**
 * Оповещения «абонемент заканчивается». Пока НЕ ставить в cron на ВМ —
 * владелец пришлёт финальный текст и скажет запускать.
 * Вручную: node --env-file=.env scripts/client-membership-notices-vm.mjs [--dry-run]
 */
import { runClientMembershipExpiringNotices } from '../api/_lib/clientPortal/clientMembershipNoticeJob.js'

try {
  const result = await runClientMembershipExpiringNotices({ dryRun: process.argv.includes('--dry-run') })
  console.log('client-membership-notices:', JSON.stringify(result))
  if (result.skipped === 'no_table') process.exitCode = 0
} catch (e) {
  console.error('client-membership-notices: ошибка', e?.code || '', e?.message || e)
  process.exitCode = 1
}
