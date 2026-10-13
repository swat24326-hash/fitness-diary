/**
 * Самовосстановление подписки на уведомления (без React / браузера). iPhone иногда меняет или теряет
 * подписку (обновление iOS, переустановка, долго не открывали); сервер, получив «адрес недействителен»,
 * удаляет её — а телефон по-прежнему «включён», и уведомления молча не приходят.
 */

/** Возврат в приложение — проверяем не чаще раза в полчаса. */
export const PUSH_HEAL_GAP_MS = 30 * 60 * 1000

/**
 * @param {{ supported: boolean, permission: string, wantOn: boolean, hasLocal: boolean, serverSubscribed?: boolean | null }} p
 *   wantOn — человек включал уведомления на этом устройстве и не выключал;
 *   serverSubscribed — сервер знает этот адрес (null — сервер не спрашивали: приложение зала)
 * @returns {'none'|'resend'|'resubscribe'} resend — передать серверу подписку телефона, resubscribe — оформить новую
 */
export function pushHealPlan({ supported, permission, wantOn, hasLocal, serverSubscribed = null }) {
  if (!supported || permission !== 'granted' || !wantOn) return 'none'
  if (serverSubscribed === true) return 'none'
  return hasLocal ? 'resend' : 'resubscribe'
}

/**
 * @param {{ lastAt: unknown, now: number, gapMs?: number }} p
 */
export function pushHealDue({ lastAt, now, gapMs = PUSH_HEAL_GAP_MS }) {
  const last = Number(lastAt)
  return !Number.isFinite(last) || last <= 0 || now - last >= gapMs
}
