/**
 * Нажали на push, а приложение уже открыто: service worker (public/push-sw.js) выбирает окно своего приложения
 * и шлёт ему адрес — окно решает, что сделать, без перезагрузки страницы.
 */

export const PUSH_OPEN_TYPE = 'push-open'

/** @returns {'client'|'coach'|'staff'} */
export function pushAppOfPath(path) {
  const p = String(path || '')
  if (p === '/me' || p.startsWith('/me/')) return 'client'
  if (p === '/coach' || p.startsWith('/coach/')) return 'coach'
  return 'staff'
}

/**
 * @param {unknown} url адрес из push (только путь своего сайта)
 * @param {string} current путь + query открытого экрана
 * @returns {{ kind: 'inbox' } | { kind: 'navigate', to: string } | null}
 */
export function pushOpenAction(url, current) {
  const raw = String(url ?? '')
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  let parsed
  try {
    parsed = new URL(raw, 'https://app.local')
  } catch {
    return null
  }
  /* Задание Планёрки — окно поверх текущего экрана: тренера не уводим с открытой тренировки. */
  if (parsed.searchParams.get('inbox') === '1' && pushAppOfPath(parsed.pathname) === 'staff') return { kind: 'inbox' }
  const to = `${parsed.pathname}${parsed.search}`
  if (to === String(current ?? '')) return null
  return { kind: 'navigate', to }
}
