/**
 * Окно «Установить приложение» (Chrome, событие beforeinstallprompt). Браузер шлёт его один раз за загрузку,
 * часто раньше, чем догрузится экран входа, /me или /coach, — поэтому ловим при старте (main.jsx), а экраны
 * читают отсюда (useInstallPrompt).
 */

let deferred = null
let installed = false
const listeners = new Set()

function emit() {
  for (const fn of listeners) fn()
}

export function armInstallPromptCapture(win = window) {
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    emit()
  })
  win.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    emit()
  })
}

export function subscribeInstallPrompt(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const hasInstallPrompt = () => deferred !== null
export const wasAppInstalled = () => installed

/** @returns {Promise<boolean>} true — пользователь согласился установить */
export async function promptInstall() {
  const e = deferred
  if (!e) return false
  deferred = null
  emit()
  e.prompt()
  const { outcome } = await e.userChoice
  if (outcome !== 'accepted') return false
  installed = true
  emit()
  return true
}
