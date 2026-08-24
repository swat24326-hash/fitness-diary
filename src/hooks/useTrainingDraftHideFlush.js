/**
 * Стабильный flush черновика при блокировке экрана / pagehide.
 * Слушатели один раз; актуальные данные — из liveRef (без stale closure).
 */

import { useEffect } from 'react'
import { shouldFlushDraftOnPageHide } from '../lib/trainingDraftDurableCore.js'

/**
 * @param {{
 *   enabled: boolean,
 *   liveRef: { current: object },
 *   onHideFlush: (live: object) => void | Promise<void>,
 * }} opts
 */
export function useTrainingDraftHideFlush({ enabled, liveRef, onHideFlush }) {
  useEffect(() => {
    if (!enabled) return undefined
    if (typeof document === 'undefined') return undefined

    const run = (eventType) => {
      if (!shouldFlushDraftOnPageHide(document.visibilityState, { eventType })) return
      const live = liveRef?.current
      if (!live || live.loadState !== 'ok') return
      if (String(live.meta?.status ?? '') === 'completed') return
      if (live.completeInFlight) return
      void onHideFlush(live)
    }

    const onVis = () => run('visibilitychange')
    const onPageHide = () => run('pagehide')

    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onPageHide)
      // Unmount вкладки: тоже сброс на диск (уход со страницы тренировки).
      run('pagehide')
    }
  }, [enabled, liveRef, onHideFlush])
}
