/**
 * Главная приложений с отдельным значком (тренер /coach, клиент /me) — со слэшем. Значок iPhone без manifest
 * считает «своими» адреса под папкой страницы, с которой его поставили: с /coach/clients или /me/chat это
 * /coach/ или /me/, и главная без слэша открывалась «чужим» — с крестиком и панелью браузера (INC-2026-10-15-04).
 */
export const COACH_HOME = '/coach/'
export const CLIENT_HOME = '/me/'

const HOMES = { '/coach': COACH_HOME, '/me': CLIENT_HOME }

/** /coach → /coach/, /me → /me/ с тем же ?… и #…; остальное — null. */
export function appHomeCanonicalUrl({ pathname, search = '', hash = '' }) {
  const home = HOMES[pathname]
  return home ? `${home}${search}${hash}` : null
}
