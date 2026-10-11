/** Телефон тренера: открыт ли со значка «Домой» и iPhone ли это (у значка iPhone своё хранилище). */
import { isIosUserAgent } from '../client/clientInstallCore.js'

export function isCoachStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || window.navigator.standalone === true
}

export function isCoachIos() {
  return isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints)
}
