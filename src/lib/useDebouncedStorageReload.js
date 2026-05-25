import { useEffect, useRef } from 'react'
import { LOCAL_DATA_CHANGED } from './dataAccess'

/** Не перегружать список клиентов из‑за чужих справочников */
export function shouldReloadTrainerClientList(detail = {}) {
  const reason = String(detail?.reason ?? '')
  if (!reason) return true
  if (reason === 'sync-complete') return true
  if (reason === 'client-deleted' || reason === 'trainer-club-cascade') return true
  return !['exercises', 'challenge-trainings', 'challenge-created', 'challenge-deleted', 'challenge-completed'].includes(
    reason,
  )
}

/** Блок челленджей на главной тренера */
export function shouldReloadTrainerChallenges(detail = {}) {
  const reason = String(detail?.reason ?? '')
  if (!reason) return false
  if (reason === 'exercises') return false
  if (reason === 'sync-complete') return true
  if (reason === 'challenge-deleted' || reason === 'challenge-created' || reason === 'challenge-completed') {
    return true
  }
  if (reason === 'client-deleted' || reason === 'trainer-club-cascade') return true
  return false
}

/** Админ: список клиентов — не дергать API из‑за чужих справочников */
export function shouldReloadAdminClientsPage(detail = {}) {
  const reason = String(detail?.reason ?? '')
  if (!reason) return true
  if (reason === 'sync-complete' || reason === 'admin-clients-cache') return true
  if (reason === 'client-deleted' || reason === 'trainer-club-cascade') return true
  return !['exercises', 'challenge-trainings', 'challenge-created', 'challenge-deleted', 'challenge-completed'].includes(
    reason,
  )
}

export function shouldReloadAdminChallengesPage(detail = {}) {
  const reason = String(detail?.reason ?? '')
  if (reason === 'exercises') return false
  return true
}

/** Статистика клиента (тренер) — только его замеры/тренировки */
export function shouldReloadTrainerClientStats(detail = {}) {
  const reason = String(detail?.reason ?? '')
  if (!reason) return true
  if (reason === 'sync-complete') return true
  return ![
    'exercises',
    'challenge-trainings',
    'challenge-created',
    'challenge-deleted',
    'challenge-completed',
    'clubs-refresh',
    'admin-clients-cache',
  ].includes(reason)
}

/** Журнал / сводка клуба (админ) */
export function shouldReloadAdminStatsPage(detail = {}) {
  return shouldReloadAdminClientsPage(detail)
}

/**
 * Подписка на LOCAL_DATA_CHANGED с debounce — меньше подвисаний на планшете.
 * @param {() => void | Promise<void>} callback
 * @param {{ debounceMs?: number, shouldRun?: (detail: object) => boolean }} [opts]
 */
export function useDebouncedStorageReload(callback, opts = {}) {
  const { debounceMs = 280, shouldRun = () => true } = opts
  const cbRef = useRef(callback)
  const shouldRef = useRef(shouldRun)
  cbRef.current = callback
  shouldRef.current = shouldRun

  useEffect(() => {
    let timer = null
    const onEvent = (e) => {
      if (!shouldRef.current(e?.detail ?? {})) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void cbRef.current()
      }, debounceMs)
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onEvent)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener(LOCAL_DATA_CHANGED, onEvent)
    }
  }, [debounceMs])
}
