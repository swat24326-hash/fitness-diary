/** Очередь не уходит из‑за сессии, а не сети: тренеру нужно войти заново (INC-2026-10-05-01). */

const AUTH_ERROR_RE = /нет сессии|нет токена|unauthorized|jwt|401|войдите снова|сессия истекла/i

/** @param {{ status?: number, error?: string, last_error?: string } | null | undefined} row */
export function isSyncAuthError(row) {
  if (!row) return false
  if (Number(row.status) === 401) return true
  return AUTH_ERROR_RE.test(`${row.error ?? ''} ${row.last_error ?? ''}`)
}

/**
 * @param {Array<{ last_error?: string }>} queue
 * @param {{ status?: number, error?: string } | null | undefined} [topError]
 */
export function isQueueAuthStuck(queue, topError) {
  const q = Array.isArray(queue) ? queue : []
  return q.some((item) => isSyncAuthError(item)) || isSyncAuthError(topError)
}

/** @param {number} queueLeft @param {boolean} authStuck */
export function syncQueueLeftMessage(queueLeft, authStuck) {
  const word = queueLeft === 1 ? 'запись' : 'записей'
  if (authStuck) {
    return `Сессия истекла — в очереди ${queueLeft} ${word}. Меню → «Восстановить приложение»; не помогло — выйдите и войдите снова. Данные на устройстве сохранены.`
  }
  return `Не всё ушло в облако: в очереди ${queueLeft} ${word}. Данные на устройстве сохранены — проверьте сеть и нажмите Sync снова.`
}
