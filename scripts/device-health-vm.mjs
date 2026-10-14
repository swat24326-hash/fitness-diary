/**
 * Центр сбоев устройств: server_no_pull, снятие проблем у замолчавших планшетов, push админам.
 * Запускает cron на ВМ (scripts/device-health-install-vm.sh) каждые 5 минут.
 * Вручную на ВМ: sudo bash scripts/device-health-vm.sh [--dry-run]
 */
import { runDeviceHealthJob } from '../api/_lib/deviceHealth/deviceHealthJob.js'

try {
  const result = await runDeviceHealthJob({ dryRun: process.argv.includes('--dry-run') })
  if (result.dry_run || result.skipped || result.updated || result.pushes) console.log('device-health:', JSON.stringify(result))
  process.exit(0)
} catch (e) {
  console.error('device-health: ошибка', e?.code || '', e?.message || e)
  process.exit(1)
}
