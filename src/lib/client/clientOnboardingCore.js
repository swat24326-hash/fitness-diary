/**
 * Баннеры первого входа в /me (без React): «Установить приложение» → «Включить напоминания».
 * Стартуют только после входа по QR / ссылке. «Позже» прячет до следующего захода, не больше 3 раз;
 * отложенное остаётся в меню и в настройках.
 */

export const CLIENT_ONBOARDING_KEY = 'fd_client_onboarding_v1'
export const ONBOARDING_LATER_MAX = 3

export function freshOnboardingState() {
  return { started: true, install_done: false, install_later: 0, push_done: false, push_later: 0 }
}

/** Сохранённое состояние: мусор или чужой формат — как будто баннеров не было. */
export function readOnboardingState(raw) {
  if (!raw || typeof raw !== 'object' || raw.started !== true) return null
  return {
    started: true,
    install_done: raw.install_done === true,
    install_later: Math.max(0, Number(raw.install_later) || 0),
    push_done: raw.push_done === true,
    push_later: Math.max(0, Number(raw.push_later) || 0),
  }
}

/**
 * Какие шаги ещё ждут клиента, по порядку.
 * @param {ReturnType<typeof freshOnboardingState> | null} state
 * @param {{ installMode: 'none'|'prompt'|'ios', pushMode: 'none'|'install_first'|'off'|'on'|'denied', snoozed?: string[] }} env
 *   installMode 'none' — уже установлено или браузер не умеет; pushMode 'install_first' — iPhone в Safari:
 *   напоминания включаются уже в приложении со значка, там этот шаг и покажем.
 * @returns {('install'|'push')[]}
 */
export function pendingOnboardingSteps(state, { installMode, pushMode, snoozed = [] }) {
  if (!state?.started) return []
  const steps = []
  if (installMode !== 'none' && !state.install_done && state.install_later < ONBOARDING_LATER_MAX) steps.push('install')
  if (pushMode === 'off' && !state.push_done && state.push_later < ONBOARDING_LATER_MAX) steps.push('push')
  return steps.filter((s) => !snoozed.includes(s))
}

/** @param {'install'|'push'} step @param {'done'|'later'} outcome */
export function applyOnboardingOutcome(state, step, outcome) {
  const next = { ...(state ?? freshOnboardingState()) }
  if (outcome === 'done') next[`${step}_done`] = true
  else next[`${step}_later`] = (next[`${step}_later`] || 0) + 1
  return next
}
