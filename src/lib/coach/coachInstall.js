/** Телефон тренера: открыт ли со значка «Домой». */
export function isCoachStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || window.navigator.standalone === true
}
