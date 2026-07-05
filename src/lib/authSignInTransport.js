/** Vercel /api недоступен — можно войти напрямую через Supabase Auth. */
export function isAuthApiTransportError(message) {
  const msg = String(message ?? '').toLowerCase()
  return (
    /failed to fetch|networkerror|network request failed|connection reset|err_connection|timed out|timeout|load failed|abort/i.test(
      msg,
    ) ||
    /таймаут|сервером входа|не удалось связаться с сервером входа/.test(msg)
  )
}
