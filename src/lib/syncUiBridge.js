/** Запрос ручной синхронизации из любого экрана (обрабатывает useHeaderSync). */
export const SYNC_NOW_REQUEST = 'fitness-diary-sync-now-request'

export function requestManualSync() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SYNC_NOW_REQUEST))
}
