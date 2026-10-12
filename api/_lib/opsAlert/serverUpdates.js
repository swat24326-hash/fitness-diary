/**
 * Обновления сервера для утренней сводки (docs/RELIABILITY_PLAN.md, 2c): unattended-upgrades ставит только
 * пакеты Ubuntu; Caddy и Node из сторонних источников сами не обновляются, поэтому о них надо напоминать.
 */
const MANUAL_PACKAGES = ['caddy', 'nodejs']
export const APT_STALE_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

/** @param {string[]} lines — `apt list --upgradable` */
export function manualUpgrades(lines) {
  const out = []
  for (const line of lines) {
    const m = /^([^/\s]+)\/\S+ (\S+) \S+ \[upgradable from: ([^\]]+)\]/.exec(line)
    if (m && MANUAL_PACKAGES.includes(m[1])) out.push(`${m[1]} ${m[3]} → ${m[2]}`)
  }
  return out
}

/**
 * @param {{ upgradableLines: string[], aptSuccessMs: number | null, rebootRequired: boolean, now: number }} input
 * @returns {{ lines: string[], problem: boolean }}
 */
export function buildServerUpdates({ upgradableLines, aptSuccessMs, rebootRequired, now }) {
  const lines = []
  const staleDays = aptSuccessMs == null ? null : Math.floor((now - aptSuccessMs) / DAY_MS)
  const stale = staleDays == null || staleDays >= APT_STALE_DAYS
  if (stale) {
    lines.push(`Источники обновлений: ${staleDays == null ? 'ни разу не обновились' : `не обновлялись ${staleDays} дн.`} — проверить apt-get update`)
  }
  const manual = manualUpgrades(upgradableLines)
  if (manual.length) lines.push(`Обновить вручную ночью: ${manual.join(', ')}`)
  if (rebootRequired) lines.push('Система обновилась — нужна ночная перезагрузка ВМ')
  return { lines, problem: stale }
}
