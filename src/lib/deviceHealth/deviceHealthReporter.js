/**
 * Планшет сам сообщает в центр сбоев (admin-data?action=device-health): при смене набора проблем
 * и раз в 30 минут «я на связи», только пока приложение на экране и есть сеть.
 * Не ждёт IndexedDB дольше 3 с и не пишет в неё; неотправленный отчёт уйдёт на следующей проверке.
 */
import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { checkRemoteBundleStale, getClientBundleId } from '../appBuildInfo.js'
import { deviceHeaders } from '../deviceIdentity.js'
import { listSyncQueue } from '../localDb.js'
import { LOCAL_DB_UPGRADE_BLOCKED, isLocalDbUpgradeBlocked } from '../localDbUpgradeWait.js'
import { noteBuildProbe, readPullMark } from './deviceHealthMarks.js'
import { collectDeviceProblems, deviceReportKey } from './deviceHealthSignalsCore.js'

export const DEVICE_HEALTH_EVENT = 'fitness-diary-device-health'

const CHECK_MS = 5 * 60_000
const HEARTBEAT_MS = 30 * 60_000
const BUILD_PROBE_MS = 30 * 60_000
const FIRST_CHECK_MS = 15_000
const QUEUE_READ_MS = 3_000
const SEND_TIMEOUT_MS = 10_000
const SENT_KEY = 'fd-device-health-sent'

let current = []
let buildStaleSince = null
let lastProbeAt = 0
let running = false

/** Текущие проблемы этого планшета (для иконки «Помощь» в шапке). */
export function getDeviceProblems() {
  return current
}

function setCurrent(next) {
  if (next.join(',') === current.join(',')) return
  current = next
  window.dispatchEvent(new CustomEvent(DEVICE_HEALTH_EVENT, { detail: { problems: next } }))
}

async function readQueue() {
  if (isLocalDbUpgradeBlocked()) return null
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), QUEUE_READ_MS)
  })
  try {
    return await Promise.race([listSyncQueue().catch(() => null), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function probeBuild(now) {
  if (now - lastProbeAt < BUILD_PROBE_MS) return buildStaleSince
  lastProbeAt = now
  const r = await checkRemoteBundleStale()
  if (r.remoteId) buildStaleSince = noteBuildProbe(r.localId, r.stale, now)
  return buildStaleSince
}

function readSent() {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? 'null')
  } catch {
    return null
  }
}

async function sendReport(payload) {
  const token = await getAccessTokenForAdminApi().catch(() => null)
  if (!token) return false
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS)
  try {
    const res = await fetch(`${window.location.origin}/api/admin-data?action=device-health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...deviceHeaders },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: ctrl.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function check() {
  if (running || document.visibilityState !== 'visible') return
  running = true
  try {
    const now = Date.now()
    const online = navigator.onLine !== false
    const queue = await readQueue()
    const problems = collectDeviceProblems({
      now,
      online,
      dbBlocked: isLocalDbUpgradeBlocked(),
      queue,
      pull: readPullMark(),
      buildStaleSince: online ? await probeBuild(now) : buildStaleSince,
    })
    setCurrent(problems)
    if (!online) return
    const bundleId = getClientBundleId()
    const key = deviceReportKey(problems, bundleId)
    const sent = readSent()
    if (sent?.key === key && now - Number(sent.at) < HEARTBEAT_MS) return
    if (await sendReport({ problems, bundle_id: bundleId, queue_count: queue?.length ?? 0 })) {
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify({ key, at: now }))
      } catch {
        /* не записали — следующая проверка отправит повторно */
      }
    }
  } finally {
    running = false
  }
}

/** Запуск для тренера; возвращает остановку. */
export function startDeviceHealthReporter() {
  const run = () => void check()
  const onVisible = () => {
    if (document.visibilityState === 'visible') run()
  }
  const first = setTimeout(run, FIRST_CHECK_MS)
  const timer = setInterval(run, CHECK_MS)
  window.addEventListener('online', run)
  window.addEventListener(LOCAL_DB_UPGRADE_BLOCKED, run)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
    window.removeEventListener('online', run)
    window.removeEventListener(LOCAL_DB_UPGRADE_BLOCKED, run)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
