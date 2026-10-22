/**
 * Куда вести красную метку в меню планшета.
 * Профиль — только если в настройках видно «Синхронизировать (N)».
 * Помощь — серьёзные ошибки журнала, отложенное обновление или внимание без очереди.
 * Бургер — то же «требует внимания», что считает шапка (очередь или журнал).
 * @param {{ syncPending?: boolean, needsAttention?: boolean, updatePending?: boolean, persistentErrors?: number }} s
 */
export function resolveHeaderAttentionTarget(s) {
  const syncPending = Boolean(s?.syncPending)
  const needsAttention = Boolean(s?.needsAttention)
  const updatePending = Boolean(s?.updatePending)
  const persistentErrors = Math.max(0, Number(s?.persistentErrors) || 0)
  const help = updatePending || (needsAttention && !syncPending)
  return {
    profile: syncPending,
    help,
    burger: needsAttention,
    helpRemark: needsAttention && !syncPending && persistentErrors === 0 && !updatePending,
  }
}
