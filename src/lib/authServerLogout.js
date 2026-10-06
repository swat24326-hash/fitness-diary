/**
 * «Выйти»: отозвать эту сессию на сервере. Не ждём ответа — офлайн выход на планшете
 * остаётся мгновенным; без сети сессия на сервере доживёт до срока refresh.
 * @param {string} supabaseUrl
 * @param {string | null} refreshToken
 */
export function sendServerLogout(supabaseUrl, refreshToken) {
  const base = String(supabaseUrl ?? '').replace(/\/$/, '')
  if (!base || !refreshToken || typeof fetch !== 'function') return
  try {
    void fetch(`${base}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}
