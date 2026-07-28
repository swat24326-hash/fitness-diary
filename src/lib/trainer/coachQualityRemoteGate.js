/**
 * Нужна ли догрузка облака для CQ: локальный кэш часто неполный
 * (другой планшет / retention / неполный pull), а Sync не чинит IDB «до конца».
 * Сравниваем completed с цифрой из trainer-self-stats (та же, что у сводки).
 * @param {{ localCompleted: number, apiCompleted?: number|null, online: boolean }} p
 */
export function coachQualityNeedsRemoteTrainings(p) {
  if (!p?.online) return false
  const local = Math.max(0, Number(p.localCompleted) || 0)
  const apiRaw = p.apiCompleted
  if (apiRaw == null || apiRaw === '') return true
  const api = Number(apiRaw)
  if (!Number.isFinite(api) || api < 0) return true
  return local < api
}
