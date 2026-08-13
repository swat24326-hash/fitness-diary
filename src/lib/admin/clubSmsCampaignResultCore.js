/**
 * Итог массовой SMS-кампании для окна отчёта (чистые функции).
 */

/**
 * @param {{
 *   ok?: number,
 *   fail?: number,
 *   aborted?: boolean,
 *   errors?: Array<{ id?: string, name?: string, error?: string }>,
 *   totalRequested?: number,
 * }} result
 * @param {{ recipientsCount?: number }} [ctx]
 */
export function buildClubSmsCampaignResultSummary(result, ctx = {}) {
  const ok = Math.max(0, Math.floor(Number(result?.ok) || 0))
  const fail = Math.max(0, Math.floor(Number(result?.fail) || 0))
  const aborted = result?.aborted === true
  const errors = Array.isArray(result?.errors)
    ? result.errors.map((e) => ({
        id: String(e?.id ?? '').trim(),
        name: String(e?.name ?? '').trim() || 'Клиент',
        error: String(e?.error ?? '').trim() || 'Ошибка отправки',
      }))
    : []
  const requested =
    Number(ctx.recipientsCount) > 0
      ? Math.floor(Number(ctx.recipientsCount))
      : Number(result?.totalRequested) > 0
        ? Math.floor(Number(result.totalRequested))
        : ok + fail

  let tone = 'ok'
  if (fail > 0 && ok > 0) tone = 'warn'
  else if (fail > 0 && ok === 0) tone = 'err'
  else if (aborted) tone = 'warn'

  let title = 'Рассылка завершена'
  if (aborted) title = 'Рассылка остановлена'
  else if (fail > 0 && ok === 0) title = 'Ничего не ушло'
  else if (fail > 0) title = 'Рассылка с ошибками'

  const headline =
    fail === 0 && !aborted
      ? `Ушло ${ok} из ${requested}`
      : `Ушло ${ok}, ошибок ${fail}${aborted ? ', остановлено' : ''}`

  return {
    title,
    headline,
    tone,
    ok,
    fail,
    aborted,
    requested,
    errors,
    hasErrors: errors.length > 0,
  }
}
