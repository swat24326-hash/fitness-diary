/**
 * Тексты окна «Выйти»: предупреждение, что сохранённое на телефоне сотрётся.
 * @typedef {'coach' | 'client'} SignOutWarnApp
 */

/** @type {Record<SignOutWarnApp, { title: string, body: string, confirm: string, cancel: string }>} */
export const SIGN_OUT_WARN = Object.freeze({
  coach: {
    title: 'Выйти из приложения?',
    body:
      'С телефона сотрутся сохранённые переписка, ежедневник и список клиентов. Без интернета их больше не увидите. Войти снова — по паролю или QR с планшета.',
    confirm: 'Выйти',
    cancel: 'Остаться',
  },
  client: {
    title: 'Выйти?',
    body:
      'С телефона сотрутся сохранённые данные и переписка. Войти снова можно только по новой ссылке из клуба.',
    confirm: 'Выйти',
    cancel: 'Остаться',
  },
})

/** @param {SignOutWarnApp} app */
export function signOutWarnCopy(app) {
  return SIGN_OUT_WARN[app] ?? SIGN_OUT_WARN.client
}
