/** Событие обновления локального кэша (IndexedDB). */
export const LOCAL_DATA_CHANGED = 'fitness-diary-storage'

export function dispatchLocalDataChanged(detail = {}) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_DATA_CHANGED, { detail }))
  } catch {
    /* ignore */
  }
}
