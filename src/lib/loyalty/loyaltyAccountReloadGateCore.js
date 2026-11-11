/**
 * Когда вкладка «Баллы» должна перечитывать account после LOCAL_DATA_CHANGED.
 * `loyalty-glance` шлёт сам loadLoyaltyAccountWithCache после GET — слушать его = вечный цикл и тряска UI.
 */
export function shouldReloadLoyaltyAccountOnLocalData(reason) {
  const r = String(reason ?? '').trim()
  if (r === 'sync-complete') return true
  return false
}
