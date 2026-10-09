/**
 * Сторож прода → ВК (docs/RELIABILITY_PLAN.md, 2a). Запускает cron на ВМ (scripts/ops-alerts-install-vm.sh).
 *   watchdog — раз в минуту: приложение, сайт снаружи, база, диск; пишет только при смене состояния.
 *   report   — утренняя сводка за сутки из journalctl.
 *   test     — «проверка связи» всем получателям.
 *   peers    — кто написал сообществу: печатает VK_ALERT_PEER_IDS=… (scripts/ops-set-vk-alert-key-vm.sh).
 * Вручную на ВМ: sudo bash scripts/ops-alerts-vm.sh test
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { getPgRestPool } from '../api/_lib/pgRest/pool.js'
import { buildNightReport } from '../api/_lib/opsAlert/nightReport.js'
import { parseVkPeerIds, sendVkAlert, vkCall } from '../api/_lib/opsAlert/vkAlertSend.js'
import { nextWatchdogState } from '../api/_lib/opsAlert/watchdogState.js'

const STATE_DIR = '/var/lib/fitness-diary-ops'
const STATE_FILE = `${STATE_DIR}/watchdog.json`
const DISK_FAIL_PCT = 95
const origin = String(process.env.PUBLIC_ORIGIN ?? '').trim().replace(/\/$/, '')
const label = origin ? `Ядро (${new URL(origin).host})` : 'Ядро'

async function checkHttp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
    return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, detail: e?.name === 'TimeoutError' ? 'нет ответа 10 с' : e?.cause?.code || e?.message || 'ошибка сети' }
  }
}

async function checkDb() {
  let pool
  try {
    pool = getPgRestPool()
    await pool.query('SELECT 1')
    return { ok: true }
  } catch (e) {
    return { ok: false, detail: e?.code || 'нет связи' }
  } finally {
    await pool?.end().catch(() => {})
  }
}

function diskUsedPct() {
  const s = fs.statfsSync('/')
  return (1 - s.bavail / s.blocks) * 100
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return null
  }
}

function journal(args) {
  return execFileSync('journalctl', [...args, '-o', 'cat', '--no-pager'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n')
}

async function send(text) {
  const result = await sendVkAlert({ token: process.env.VK_ALERT_TOKEN, peerIds: parseVkPeerIds(process.env.VK_ALERT_PEER_IDS), text })
  for (const err of result.errors) console.error('ops-alerts: ВК', err)
  return result
}

const mode = process.argv[2]
try {
  if (mode === 'watchdog') {
    const port = Number(process.env.PORT) || 8080
    const disk = diskUsedPct()
    const results = {
      app: await checkHttp(`http://127.0.0.1:${port}/api/health`),
      db: await checkDb(),
      disk: disk < DISK_FAIL_PCT ? { ok: true } : { ok: false, detail: `занято ${Math.round(disk)}%` },
    }
    if (origin) results.site = await checkHttp(`${origin}/api/health`)
    const { state, messages } = nextWatchdogState(readState(), results, Date.now())
    fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
    fs.writeFileSync(STATE_FILE, JSON.stringify(state))
    if (messages.length) {
      console.log('ops-alerts:', messages.join(' | '))
      await send(`${label}\n${messages.join('\n')}`)
    }
  } else if (mode === 'report') {
    const { text } = buildNightReport({
      apiLines: journal(['-u', 'os-hybrid', '--since', '24 hours ago']),
      backupLines: journal(['-t', 'fd-pg-backup', '--since', '26 hours ago']),
      drillLines: journal(['-t', 'fd-pg-restore-drill', '--since', '40 days ago']),
      cloudExpected: Boolean(String(process.env.PG_BACKUP_BUCKET ?? '').trim()),
      state: readState(),
      diskUsedPct: diskUsedPct(),
      now: Date.now(),
      label,
    })
    console.log(text)
    await send(text)
  } else if (mode === 'test') {
    const { sent } = await send(`${label}: проверка связи — уведомления о сбоях будут приходить сюда`)
    console.log(`ops-alerts: доставлено ${sent}`)
    if (!sent) process.exit(1)
  } else if (mode === 'peers') {
    const token = process.env.VK_ALERT_TOKEN
    const conv = await vkCall('messages.getConversations', { count: 20 }, { token })
    const ids = (conv?.items ?? []).map((i) => i?.conversation?.peer).filter((p) => p?.type === 'user').map((p) => p.id)
    if (!ids.length) {
      console.error('Никто ещё не написал сообществу — напишите ему любое сообщение и запустите снова')
      process.exit(1)
    }
    const users = await vkCall('users.get', { user_ids: ids.join(',') }, { token })
    console.error(`Получатели: ${(users ?? []).map((u) => `${u.first_name} ${u.last_name}`).join(', ')}`)
    console.log(`VK_ALERT_PEER_IDS=${ids.join(',')}`)
  } else {
    console.error('Usage: ops-alerts-vm.mjs watchdog|report|test|peers')
    process.exit(2)
  }
  process.exit(0)
} catch (e) {
  console.error('ops-alerts: ошибка', e?.code || '', e?.message || e)
  process.exit(1)
}
