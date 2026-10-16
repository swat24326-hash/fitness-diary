/**
 * Применение обновления PWA: SW skipWaiting → controllerchange → reload / hard recover.
 * Один вход для баннера и recoverApp.
 */

import { setBackgroundSyncPaused } from './syncService.js'
import { clearAppUpdatePending, markAppUpdateApplied } from './appUpdateState.js'
import { shouldHardRecoverPwaUpdate } from './appUpdateReloadGuard.js'
import {
  clearPwaUpdateReloadGuardSession,
  readPwaUpdateReloadGuardFromSession,
  recordPwaUpdateReloadAttempt,
} from './appUpdateReloadGuardSession.js'
import { clearPwaUpdateInFlight, markPwaUpdateInFlight } from './appUpdateInFlightSession.js'
import { hardResetAppShell, recoverFromStaleViteDeploy } from './viteChunkReload.js'
import { flushTrainingDraftsBeforePwaUpdate } from './trainingDraftUpdateFlush.js'
import { shouldHardResetAfterUpdateAttempt } from './appUpdatePlanCore.js'
import { checkRemoteBundleStale } from './appBuildInfo.js'

const SKIP_WAITING_RACE_MS = 2_500
const CONTROLLER_CHANGE_WAIT_MS = 5_000
const INSTALLING_WAIT_MS = 20_000
const WAITING_POLL_MS = 250

async function probeRemoteStale() {
  try {
    const { stale } = await checkRemoteBundleStale()
    return { remoteStale: stale === true }
  } catch {
    return { remoteStale: false }
  }
}

function postSkipWaiting(registration) {
  const waiting = registration?.waiting
  if (!waiting) return false
  waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}

/** Новая версия ещё качается (слабый планшет) — дождаться, иначе SKIP_WAITING некому отправить. */
async function waitForInstallingWorker(registration, timeoutMs = INSTALLING_WAIT_MS) {
  const worker = registration?.installing
  if (!worker) return
  await new Promise((resolve) => {
    const done = () => {
      worker.removeEventListener('statechange', onState)
      resolve(undefined)
    }
    const onState = () => {
      if (worker.state !== 'installing') done()
    }
    worker.addEventListener('statechange', onState)
    setTimeout(done, timeoutMs)
  })
}

/**
 * buildStale часто раньше, чем SW скачал waiting: update() + дождаться waiting/installing.
 * @returns {Promise<boolean>} есть ли waiting к моменту выхода
 */
async function ensureWaitingWorker(registration, timeoutMs = INSTALLING_WAIT_MS) {
  if (!registration) return false
  if (registration.waiting) return true
  try {
    await registration.update?.()
  } catch {
    /* ignore */
  }
  const deadline = Date.now() + Math.max(0, timeoutMs)
  while (Date.now() < deadline) {
    if (registration.waiting) return true
    if (registration.installing) {
      await waitForInstallingWorker(registration, Math.max(0, deadline - Date.now()))
      if (registration.waiting) return true
    }
    await new Promise((r) => setTimeout(r, WAITING_POLL_MS))
  }
  return Boolean(registration.waiting)
}

/** @returns {Promise<boolean>} сменился ли service worker, управляющий страницей */
async function waitForControllerChange(timeoutMs = CONTROLLER_CHANGE_WAIT_MS) {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null
  if (!sw) return false
  return new Promise((resolve) => {
    let timer = 0
    const finish = (changed) => {
      sw.removeEventListener('controllerchange', onChange)
      clearTimeout(timer)
      resolve(changed)
    }
    const onChange = () => finish(true)
    sw.addEventListener('controllerchange', onChange, { once: true })
    timer = setTimeout(() => finish(false), timeoutMs)
  })
}

/**
 * @param {{
 *   manual?: boolean,
 *   updateServiceWorker?: (reloadPage?: boolean) => Promise<void>,
 * }} [opts]
 * @returns {Promise<{ ok: boolean, mode: 'reload' | 'hard_recover' | 'aborted', error?: string }>}
 */
export async function applyPwaUpdate(opts = {}) {
  const manual = opts.manual === true
  const updateServiceWorker = opts.updateServiceWorker

  // Сначала дописать черновики тренировок (durable + IDB), иначе reload съест ввод.
  try {
    await flushTrainingDraftsBeforePwaUpdate()
  } catch {
    /* best-effort */
  }

  markPwaUpdateInFlight()
  setBackgroundSyncPaused(true)

  try {
    const guardBefore = readPwaUpdateReloadGuardFromSession()
    if (manual && shouldHardRecoverPwaUpdate(guardBefore)) {
      markAppUpdateApplied()
      clearAppUpdatePending()
      clearPwaUpdateReloadGuardSession()
      await recoverFromStaleViteDeploy()
      return { ok: true, mode: 'hard_recover' }
    }

    recordPwaUpdateReloadAttempt()

    const registration =
      typeof navigator !== 'undefined' ? await navigator.serviceWorker?.getRegistration?.() : null
    await ensureWaitingWorker(registration)
    postSkipWaiting(registration)

    if (typeof updateServiceWorker === 'function') {
      await Promise.race([
        Promise.resolve(updateServiceWorker(true)).catch((e) => {
          console.warn('[PWA] updateServiceWorker failed', e)
        }),
        new Promise((resolve) => setTimeout(resolve, SKIP_WAITING_RACE_MS)),
      ])
    }

    if (registration?.waiting) postSkipWaiting(registration)
    const controllerChanged = await waitForControllerChange(CONTROLLER_CHANGE_WAIT_MS)

    markAppUpdateApplied()
    clearAppUpdatePending()

    if (!controllerChanged) {
      const { remoteStale } = await probeRemoteStale()
      if (shouldHardResetAfterUpdateAttempt({ controllerChanged, remoteStale })) {
        clearPwaUpdateReloadGuardSession()
        await hardResetAppShell()
        return { ok: true, mode: 'hard_recover' }
      }
    }

    if (typeof window !== 'undefined') {
      window.location.reload()
    }
    return { ok: true, mode: 'reload' }
  } catch (e) {
    const msg = e?.message ? String(e.message) : 'applyPwaUpdate failed'
    console.warn('[PWA]', msg)
    setBackgroundSyncPaused(false)
    if (manual) {
      try {
        clearPwaUpdateReloadGuardSession()
        await recoverFromStaleViteDeploy()
        return { ok: true, mode: 'hard_recover' }
      } catch (e2) {
        clearPwaUpdateInFlight()
        return { ok: false, mode: 'aborted', error: String(e2?.message ?? e2 ?? msg) }
      }
    }
    clearPwaUpdateInFlight()
    return { ok: false, mode: 'aborted', error: msg }
  }
}

/** Успешная новая сборка после reload — снять сторожки цикла. */
export function acknowledgePwaUpdateSuccess() {
  clearPwaUpdateReloadGuardSession()
  clearPwaUpdateInFlight()
  clearAppUpdatePending()
}
