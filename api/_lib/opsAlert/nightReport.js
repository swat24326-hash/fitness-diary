/**
 * Утренняя сводка прода за сутки в ВК (docs/RELIABILITY_PLAN.md, 2a): ошибки сервера, ночная копия базы,
 * простои по сторожу, диск. Вход — строки journalctl, здесь только разбор и текст.
 */
import { CHECK_LABELS_RU, minutesRu } from './watchdogState.js'

const API_LINE = /^\[api\] (\S+) (\S+) (\d{3}) /
const CRASH_LINE = /^\[portable-api\] (?!http:\/\/|static:|cloudKey:)/
const CLIENT_ABORT_LINE = /^\[portable-api\] Error: aborted\b/
const LOGIN_PATHS = ['/api/auth-sign-in', '/api/client-auth', '/auth/v1/token']
export const DISK_WARN_PCT = 85
const DAY_MS = 24 * 60 * 60 * 1000

/** @param {number} ms */
function timeMsk(ms) {
  return new Date(ms).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })
}

/** @param {string[]} lines */
export function summarizeApiLog(lines) {
  const byPath = new Map()
  let errors5xx = 0
  let loginLimited = 0
  let crashes = 0
  let clientAborts = 0
  let dbErrors = 0
  for (const line of lines) {
    const m = API_LINE.exec(line)
    if (m) {
      const status = Number(m[3])
      if (status >= 500) {
        errors5xx++
        byPath.set(m[2], (byPath.get(m[2]) ?? 0) + 1)
      } else if (status === 429 && LOGIN_PATHS.includes(m[2])) loginLimited++
      continue
    }
    if (CLIENT_ABORT_LINE.test(line)) clientAborts++
    else if (CRASH_LINE.test(line)) crashes++
    else if (line.startsWith('[pgrest]') || line.includes('база недоступна')) dbErrors++
  }
  const topPaths = [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} ×${n}`)
  return { errors5xx, topPaths, loginLimited, crashes, clientAborts, dbErrors }
}

/** @param {string[]} lines — journalctl -t fd-pg-backup за ~сутки */
export function lastBackupOk(lines) {
  const hit = [...lines].reverse().find((l) => l.includes('pg-backup: ок'))
  return hit ? hit.slice(hit.indexOf('pg-backup: ок') + 'pg-backup: ок'.length).trim() : null
}

/**
 * @param {{ apiLines: string[], backupLines: string[], state: import('./watchdogState.js').WatchdogState | null, diskUsedPct: number, now: number, label: string }} input
 * @returns {{ text: string, problems: boolean }}
 */
export function buildNightReport({ apiLines, backupLines, state, diskUsedPct, now, label }) {
  const api = summarizeApiLog(apiLines)
  const backup = lastBackupOk(backupLines)
  const outages = (state?.events ?? []).filter((e) => now - e.to < DAY_MS)
  const downNow = Object.entries(state?.checks ?? {}).filter(([, c]) => c.downSince != null)
  const problems =
    api.errors5xx > 0 || api.crashes > 0 || api.dbErrors > 0 || !backup || outages.length > 0 || downNow.length > 0 || diskUsedPct >= DISK_WARN_PCT

  const lines = [`${label}: сводка за сутки — ${problems ? 'ЕСТЬ ПРОБЛЕМЫ' : 'всё в порядке'}`]
  if (downNow.length) lines.push(`Сейчас не работает: ${downNow.map(([k]) => CHECK_LABELS_RU[k] ?? k).join(', ')}`)
  lines.push(
    outages.length
      ? `Простои: ${outages.map((e) => `${CHECK_LABELS_RU[e.key] ?? e.key} ${timeMsk(e.from)}–${timeMsk(e.to)} (${minutesRu(e.to - e.from)})`).join('; ')}`
      : 'Простоев не было',
  )
  lines.push(`Ошибки сервера (5xx): ${api.errors5xx}${api.topPaths.length ? ` — ${api.topPaths.join(', ')}` : ''}`)
  if (api.crashes || api.dbErrors) lines.push(`Сбои приложения: ${api.crashes}, ошибки связи с базой: ${api.dbErrors}`)
  if (api.clientAborts) lines.push(`Устройство оборвало связь посреди запроса: ${api.clientAborts} (слабый Wi-Fi; данные уйдут при Sync)`)
  if (api.loginLimited) lines.push(`Входов остановлено лимитом попыток: ${api.loginLimited}`)
  lines.push(backup ? `Копия базы: ок ${backup}` : 'Копия базы: СВЕЖЕЙ НЕТ — проверить pg-backup')
  lines.push(`Диск занят: ${Math.round(diskUsedPct)}%${diskUsedPct >= DISK_WARN_PCT ? ' — пора чистить или расширять' : ''}`)
  return { text: lines.join('\n'), problems }
}
