/**
 * Онлайн-проверка карты перед созданием клиента тренером (чистая логика ответа API).
 */

/**
 * @param {{ ok?: boolean, conflict?: boolean, error?: string, client?: object } | null | undefined} body
 * @returns {{ blocked: false } | { blocked: true, error: string, client: object|null }}
 */
export function resolveTrainerClubCardCheckResponse(body) {
  if (!body || typeof body !== 'object') return { blocked: false }
  if (body.conflict === true || body.ok === false) {
    const error = String(body.error ?? '').trim()
    if (!error) {
      return {
        blocked: true,
        error: 'В этом клубе клиент с такой картой уже есть. Новую карточку не создаём.',
        client: body.client ?? null,
      }
    }
    return { blocked: true, error, client: body.client ?? null }
  }
  return { blocked: false }
}

/** Текст alert после локальной/облачной блокировки по карте. */
export function trainerCardConflictAlertRu(error) {
  const base = String(error ?? '').trim() || 'В этом клубе клиент с такой картой уже есть.'
  return `${base}\n\nКлиент уже в базе клуба. Обратитесь к администратору или менеджеру — они добавят абонемент ПЗ к существующей карточке.`
}
